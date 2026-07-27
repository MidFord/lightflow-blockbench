(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_atmosphere';
    const PLUGIN_VERSION = '1.2.0';
    const MAX_VOLUMES = 4;
    const MAX_LIGHTS = 4;
    const MAX_SHADOWS = 2;
    const MAX_RAY_STEPS = 96;
    const STORAGE_KEY = 'lightflow_atmosphere.settings';
    const DEFAULT_SETTINGS = {
        enabled: true,
        temporal_jitter: false,
        helper_mask: true,
        static_cache: true,
        frustum_culling: true,
        preview_quality: 'balanced',
        render_quality: 'high',
        preview_scale: 0.5,
        render_scale: 1.0
    };

    const PREVIEW_STEPS = { draft: 16, balanced: 24, high: 36, ultra: 48 };
    const RENDER_STEPS = { draft: 28, balanced: 44, high: 64, ultra: 96 };
    const QUALITY_OPTIONS = {
        draft: 'Draft',
        balanced: 'Balanced',
        high: 'High',
        ultra: 'Ultra'
    };

    const VOLUME_PRESETS = {
        soft_mist: {
            composite_mode: 'physical', shadow_fill: 0.18,
            density_mode: 'height', density: 0.032, scattering_strength: 0.82,
            absorption: 0.16, anisotropy: 0.18, height_falloff: 1.35,
            height_offset: 0.12, edge_feather: 0.14, ambient: 0.22,
            scattering_color: [214, 229, 242], absorption_color: [226, 235, 242]
        },
        godrays: {
            composite_mode: 'shafts', shadow_fill: 0,
            density_mode: 'uniform', density: 0.06, scattering_strength: 1.4,
            absorption: 0.025, anisotropy: 0.68, edge_feather: 0.32,
            ambient: 0.0, receive_shadows: true,
            scattering_color: [255, 238, 205], absorption_color: [255, 248, 232]
        },
        clouds: {
            composite_mode: 'physical', shadow_fill: 0.12,
            density_mode: 'cloud', density: 0.095, scattering_strength: 1.0,
            absorption: 0.34, anisotropy: 0.42, edge_feather: 0.18,
            noise_scale: 3.6, noise_detail: 4, coverage: 0.46, erosion: 0.24,
            height_falloff: 0.65, height_offset: 0.18, ambient: 0.16,
            scattering_color: [244, 247, 255], absorption_color: [212, 224, 240]
        },
        stage_haze: {
            composite_mode: 'physical', shadow_fill: 0.08,
            density_mode: 'uniform', density: 0.018, scattering_strength: 0.72,
            absorption: 0.08, anisotropy: 0.58, edge_feather: 0.2,
            ambient: 0.04, scattering_color: [232, 238, 255],
            absorption_color: [242, 246, 255]
        },
        cinematic_dust: {
            composite_mode: 'shafts', shadow_fill: 0.02,
            density_mode: 'cloud', density: 0.024, scattering_strength: 0.86,
            absorption: 0.02, anisotropy: 0.74, edge_feather: 0.24,
            noise_scale: 8.0, noise_detail: 2, coverage: 0.32, erosion: 0.5,
            height_falloff: 0.25, height_offset: 0.05, ambient: 0.015,
            receive_shadows: true, bloom_contribution: 1.25,
            scattering_color: [255, 226, 184], absorption_color: [255, 240, 216]
        }
    };

    let VolumeElement = null;
    let atmospherePanel = null;
    let addVolumeAction = null;
    let editVolumeAction = null;
    let settingsAction = null;
    let volumePreviewController = null;
    let animationFrame = null;
    let previewRenderFrame = null;
    let lastAnimatedFrame = 0;
    let storageWriteFailureReported = false;
    let lastPreviewPatchCheck = 0;
    let syncingPanel = false;
    let atmosphereRevision = 0;
    let atmosphereProject = null;
    const deletables = [];
    const publishedWindowBindings = new Map();

    /*
     * VolumeElement stores project data, the panel edits that data, and
     * AtmosphereManager converts the active volumes into cached depth and
     * composite passes. Preview.render is wrapped only at this final boundary.
     */

    function publishWindowBinding(name, value) {
        if (!publishedWindowBindings.has(name)) {
            publishedWindowBindings.set(name, {
                hadOwnValue: Object.prototype.hasOwnProperty.call(window, name),
                previousValue: window[name],
                ownedValue: value
            });
        } else {
            publishedWindowBindings.get(name).ownedValue = value;
        }
        window[name] = value;
        return value;
    }

    function restoreWindowBindings() {
        Array.from(publishedWindowBindings.entries()).reverse().forEach(([name, binding]) => {
            if (window[name] !== binding.ownedValue) return;
            if (binding.hadOwnValue) window[name] = binding.previousValue;
            else delete window[name];
        });
        publishedWindowBindings.clear();
    }

    function disposeRegisteredResources() {
        deletables.splice(0).reverse().forEach(resource => {
            if (!resource || typeof resource.delete !== 'function') return;
            try {
                resource.delete();
            } catch (error) {
                console.warn('[Lightflow Atmosphere] Failed to release a registered resource.', error);
            }
        });
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value)));
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function readSettings() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return Object.assign({}, DEFAULT_SETTINGS, parsed && typeof parsed === 'object' ? parsed : {});
        } catch (error) {
            console.warn('[Lightflow Atmosphere] Saved settings are invalid; using defaults.', error);
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            if (!storageWriteFailureReported) {
                console.warn('[Lightflow Atmosphere] Settings could not be persisted; project volumes remain usable.', error);
                storageWriteFailureReported = true;
            }
        }
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
    }

    function markerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        return window.LightManagerUI?.markerColor?.(index, tone, fallback) || fallback;
    }

    function colorArrayToHex(value) {
        const source = Array.isArray(value) ? value : [255, 255, 255];
        return '#' + source.slice(0, 3).map(channel => {
            return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
        }).join('');
    }

    function hexToColorArray(value, fallback) {
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        if (!match) return Array.isArray(fallback) ? fallback.slice(0, 3) : [255, 255, 255];
        const integer = parseInt(match[1], 16);
        return [(integer >> 16) & 255, (integer >> 8) & 255, integer & 255];
    }

    function colorArrayToVector(value, target) {
        const source = Array.isArray(value) ? value : [255, 255, 255];
        target.set(
            clamp(finite(source[0], 255) / 255, 0, 8),
            clamp(finite(source[1], 255) / 255, 0, 8),
            clamp(finite(source[2], 255) / 255, 0, 8)
        );
        return target;
    }

    function getCubeMesh(cube) {
        if (!cube) return null;
        return cube.mesh || (window.Project && Project.nodes_3d ? Project.nodes_3d[cube.uuid] : null) || null;
    }

    function getRenderElements() {
        const elements = [];
        const seen = new Set();
        [window.Cube, window.Mesh, window.TextureMesh].forEach(Type => {
            const list = Type && Array.isArray(Type.all) ? Type.all : [];
            list.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);
                elements.push(element);
            });
        });
        return elements;
    }

    function getSelectedRenderElements() {
        const elements = [];
        const seen = new Set();
        [window.Cube, window.Mesh, window.TextureMesh].forEach(Type => {
            const list = Type && Array.isArray(Type.selected) ? Type.selected : [];
            list.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);
                elements.push(element);
            });
        });
        return elements;
    }

    function collectPreviews() {
        const previews = new Set();
        const add = preview => {
            if (preview && preview.renderer && typeof preview.render === 'function') previews.add(preview);
        };
        add(window.Preview && Preview.selected);
        add(window.Preview && Preview.all && Preview.all.main);
        add(window.main_preview);
        if (window.Preview && Array.isArray(Preview.all)) Preview.all.forEach(add);
        else if (window.Preview && Preview.all && typeof Preview.all === 'object') Object.values(Preview.all).forEach(add);
        return previews;
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (previewRenderFrame !== null) return;
        const revision = atmosphereRevision;
        const project = window.Project || null;
        const render = () => {
            previewRenderFrame = null;
            if (window.LightManagerStudioRenderSession) return;
            if (
                revision !== atmosphereRevision ||
                project !== atmosphereProject ||
                project !== (window.Project || null)
            ) return;
            const preview = window.Preview && Preview.selected;
            if (preview && typeof preview.render === 'function') preview.render();
            else if (window.Canvas && typeof Canvas.updateView === 'function') Canvas.updateView({ elements: [], element_aspects: {} });
        };
        if (typeof requestAnimationFrame === 'function') previewRenderFrame = requestAnimationFrame(render);
        else {
            previewRenderFrame = 'microtask';
            queueMicrotask(render);
        }
    }

    function beginAtmosphereProject(project) {
        atmosphereRevision += 1;
        atmosphereProject = project || null;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
    }

    const FULLSCREEN_VERTEX_SHADER = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `;

    const VOLUME_FRAGMENT_SHADER = `
        precision highp float;
        #define MAX_VOLUMES ${MAX_VOLUMES}
        #define MAX_LIGHTS ${MAX_LIGHTS}
        #define MAX_STEPS ${MAX_RAY_STEPS}
        #define PI 3.141592653589793

        uniform sampler2D tSceneDepth;
        uniform sampler2D tCubeDepth;
        uniform sampler2D uNoiseTexture;
        uniform sampler2D uShadowMap0;
        uniform sampler2D uShadowMap1;
        uniform mat4 uInverseProjection;
        uniform mat4 uCameraWorld;
        uniform mat4 uVolumeInverse[MAX_VOLUMES];
        uniform mat4 uShadowMatrix0;
        uniform mat4 uShadowMatrix1;
        uniform vec4 uVolumeShapeMode[MAX_VOLUMES];
        uniform vec4 uVolumeOptics[MAX_VOLUMES];
        uniform vec4 uVolumeHeightNoise[MAX_VOLUMES];
        uniform vec4 uVolumeCloudWind[MAX_VOLUMES];
        uniform vec4 uVolumeFlags[MAX_VOLUMES];
        uniform vec3 uVolumeColor[MAX_VOLUMES];
        uniform vec3 uVolumeAbsorptionColor[MAX_VOLUMES];
        uniform vec4 uLightPositionType[MAX_LIGHTS];
        uniform vec4 uLightDirectionRange[MAX_LIGHTS];
        uniform vec4 uLightColorIntensity[MAX_LIGHTS];
        uniform vec4 uLightConeShadow[MAX_LIGHTS];
        uniform vec4 uShadowParams0;
        uniform vec4 uShadowParams1;
        uniform vec2 uResolution;
        uniform vec2 uFrameOrigin;
        uniform vec2 uFramePixelScale;
        uniform vec3 uCameraPosition;
        uniform vec3 uAmbientColor;
        uniform float uCameraFar;
        uniform float uTime;
        uniform int uVolumeCount;
        uniform int uLightCount;
        uniform int uSteps;
        uniform int uShadowSamples;
        uniform bool uOrthographic;
        uniform bool uTemporalJitter;
        uniform bool uHelperMask;
        uniform bool uBloomPass;
        varying vec2 vUv;

        bool solidDepth(float depth) {
            return depth > 0.000001 && depth < 0.999999;
        }

        vec3 viewPosition(vec2 uv, float depth) {
            vec4 point = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            return point.xyz / max(abs(point.w), 0.000001);
        }

        vec3 worldPosition(vec2 uv, float depth) {
            return (uCameraWorld * vec4(viewPosition(uv, depth), 1.0)).xyz;
        }

        float hash13(vec3 point) {
            point = fract(point * 0.1031);
            point += dot(point, point.yzx + 33.33);
            return fract((point.x + point.y) * point.z);
        }

        float projectedNoise3D(vec3 point) {
            vec2 projectionA = point.xy + point.z * vec2(0.173, 0.317);
            vec2 projectionB = point.yz + point.x * vec2(0.271, 0.119);
            float first = texture2D(uNoiseTexture, projectionA).r;
            float second = texture2D(uNoiseTexture, projectionB).g;
            return mix(first, second, 0.5);
        }

        float fbm(vec3 point, float detail) {
            float result = 0.0;
            float weight = 0.55;
            float normalization = 0.0;
            for (int octave = 0; octave < 3; octave++) {
                if (float(octave) <= detail - 0.5) {
                    result += projectedNoise3D(point) * weight;
                    normalization += weight;
                }
                point = point * 2.03 + vec3(17.1, 7.7, 13.4);
                weight *= 0.5;
            }
            return result / max(normalization, 0.0001);
        }

        bool volumeInterval(int index, vec3 rayOrigin, vec3 rayDirection, out vec2 interval) {
            interval = vec2(0.0);
            vec3 localOrigin = (uVolumeInverse[index] * vec4(rayOrigin, 1.0)).xyz;
            vec3 localDirection = (uVolumeInverse[index] * vec4(rayDirection, 0.0)).xyz;
            if (uVolumeShapeMode[index].x < 0.5) {
                vec3 safeDirection = localDirection;
                if (abs(safeDirection.x) < 0.000001) safeDirection.x = safeDirection.x < 0.0 ? -0.000001 : 0.000001;
                if (abs(safeDirection.y) < 0.000001) safeDirection.y = safeDirection.y < 0.0 ? -0.000001 : 0.000001;
                if (abs(safeDirection.z) < 0.000001) safeDirection.z = safeDirection.z < 0.0 ? -0.000001 : 0.000001;
                vec3 first = (-vec3(0.5) - localOrigin) / safeDirection;
                vec3 second = (vec3(0.5) - localOrigin) / safeDirection;
                vec3 nearPlane = min(first, second);
                vec3 farPlane = max(first, second);
                interval = vec2(max(max(nearPlane.x, nearPlane.y), nearPlane.z), min(min(farPlane.x, farPlane.y), farPlane.z));
            } else {
                float a = dot(localDirection, localDirection);
                float b = 2.0 * dot(localOrigin, localDirection);
                float c = dot(localOrigin, localOrigin) - 0.25;
                float discriminant = b * b - 4.0 * a * c;
                if (discriminant < 0.0 || a < 0.0000001) return false;
                float root = sqrt(discriminant);
                interval = vec2((-b - root) / (2.0 * a), (-b + root) / (2.0 * a));
            }
            interval.x = max(interval.x, 0.0);
            return interval.y > interval.x;
        }

        float sampleVolumeDensity(int index, vec3 worldPoint) {
            vec3 local = (uVolumeInverse[index] * vec4(worldPoint, 1.0)).xyz;
            float shape = uVolumeShapeMode[index].x;
            float mode = uVolumeShapeMode[index].y;
            float feather = max(uVolumeShapeMode[index].z, 0.0001);
            float edgeDistance = shape < 0.5
                ? 0.5 - max(abs(local.x), max(abs(local.y), abs(local.z)))
                : 0.5 - length(local);
            if (edgeDistance <= 0.0) return 0.0;
            float edge = smoothstep(0.0, feather * 0.5, edgeDistance);
            // Convert compact Blockbench units into a practical optical scale.
            // This prevents a normal 16-64 unit domain from flattening all
            // surface lighting while keeping density behavior predictable.
            float density = uVolumeOptics[index].x * 0.12;
            float normalizedHeight = clamp(local.y + 0.5, 0.0, 1.0);
            float heightFalloff = uVolumeHeightNoise[index].x;
            float heightOffset = uVolumeHeightNoise[index].y;
            if (mode > 0.5) {
                density *= exp(-heightFalloff * max(normalizedHeight - heightOffset, 0.0));
            }
            if (mode > 1.5) {
                float noiseScale = max(uVolumeHeightNoise[index].z, 0.01);
                float detail = uVolumeHeightNoise[index].w;
                vec3 wind = vec3(uVolumeCloudWind[index].z, 0.0, uVolumeCloudWind[index].w) * uTime;
                float cloudNoise = fbm((local + 0.5) * noiseScale + wind, detail);
                float coverage = clamp(uVolumeCloudWind[index].x, 0.0, 0.99);
                float erosion = max(uVolumeCloudWind[index].y, 0.01);
                density *= smoothstep(coverage, min(1.0, coverage + erosion), cloudNoise);
            }
            return max(density * edge, 0.0);
        }

        float henyeyGreenstein(float cosTheta, float anisotropy) {
            float g = clamp(anisotropy, -0.92, 0.92);
            float denominator = max(1.0 + g * g - 2.0 * g * cosTheta, 0.0001);
            // Light Manager uses artist-facing intensity units. Relative HG
            // normalization preserves the directional lobe without making an
            // intensity of 1 almost invisible after the physical 1/(4*pi).
            return (1.0 - g * g) / pow(denominator, 1.5);
        }

        float unpackDepth(vec4 packedDepth) {
            const vec4 unpackFactors = vec4(
                0.000000059371814728,
                0.000015199184417725,
                0.0038909912109375,
                0.99609375
            );
            return dot(packedDepth, unpackFactors);
        }

        float shadowCompare0(vec3 worldPoint) {
            vec4 projected = uShadowMatrix0 * vec4(worldPoint, 1.0);
            vec3 coordinates = projected.xyz / max(projected.w, 0.000001);
            if (coordinates.x <= 0.0 || coordinates.x >= 1.0 || coordinates.y <= 0.0 || coordinates.y >= 1.0 || coordinates.z <= 0.0 || coordinates.z >= 1.0) return 1.0;
            vec2 texel = 1.0 / max(uShadowParams0.xy, vec2(1.0));
            float bias = uShadowParams0.z;
            float radius = max(uShadowParams0.w, 0.0);
            vec2 offset = texel * max(radius, 0.75);
            float compareDepth = coordinates.z + bias;
            if (uShadowSamples <= 1) return step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy)));
            float visibility = 0.0;
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2(-offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2( offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2(-offset.x,  offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2( offset.x,  offset.y))));
            return visibility * 0.25;
        }

        float shadowCompare1(vec3 worldPoint) {
            vec4 projected = uShadowMatrix1 * vec4(worldPoint, 1.0);
            vec3 coordinates = projected.xyz / max(projected.w, 0.000001);
            if (coordinates.x <= 0.0 || coordinates.x >= 1.0 || coordinates.y <= 0.0 || coordinates.y >= 1.0 || coordinates.z <= 0.0 || coordinates.z >= 1.0) return 1.0;
            vec2 texel = 1.0 / max(uShadowParams1.xy, vec2(1.0));
            float bias = uShadowParams1.z;
            float radius = max(uShadowParams1.w, 0.0);
            vec2 offset = texel * max(radius, 0.75);
            float compareDepth = coordinates.z + bias;
            if (uShadowSamples <= 1) return step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy)));
            float visibility = 0.0;
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2(-offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2( offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2(-offset.x,  offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2( offset.x,  offset.y))));
            return visibility * 0.25;
        }

        float lightShadow(int slot, vec3 worldPoint) {
            float visibility = 1.0;
            if (slot == 0) {
                visibility = shadowCompare0(worldPoint);
            } else if (slot == 1) {
                visibility = shadowCompare1(worldPoint);
            }
            return visibility;
        }

        vec3 volumeLighting(int volumeIndex, vec3 worldPoint, vec3 viewDirection) {
            vec3 lighting = uAmbientColor * uVolumeFlags[volumeIndex].y;
            float anisotropy = uVolumeOptics[volumeIndex].w;
            float shadowFill = clamp(uVolumeShapeMode[volumeIndex].w, 0.0, 1.0);
            bool receiveShadows = uVolumeFlags[volumeIndex].x > 0.5;
            for (int lightIndex = 0; lightIndex < MAX_LIGHTS; lightIndex++) {
                if (lightIndex >= uLightCount) continue;
                vec4 positionType = uLightPositionType[lightIndex];
                vec4 directionRange = uLightDirectionRange[lightIndex];
                vec4 colorIntensity = uLightColorIntensity[lightIndex];
                vec4 coneShadow = uLightConeShadow[lightIndex];
                vec3 toLight;
                float attenuation = 1.0;
                if (positionType.w < 0.5) {
                    toLight = normalize(-directionRange.xyz);
                } else {
                    vec3 delta = positionType.xyz - worldPoint;
                    float distanceToLight = max(length(delta), 0.0001);
                    toLight = delta / distanceToLight;
                    if (directionRange.w > 0.001) {
                        float normalizedDistance = distanceToLight / directionRange.w;
                        attenuation = 1.0 / (1.0 + 4.0 * normalizedDistance * normalizedDistance);
                        attenuation *= 1.0 - smoothstep(0.82, 1.0, normalizedDistance);
                    } else {
                        attenuation = 1.0 / (1.0 + 0.025 * distanceToLight * distanceToLight);
                    }
                    if (positionType.w > 1.5) {
                        float cone = dot(normalize(directionRange.xyz), -toLight);
                        attenuation *= smoothstep(coneShadow.x, max(coneShadow.y, coneShadow.x + 0.0001), cone);
                    }
                }
                if (attenuation <= 0.00001) continue;
                // viewDirection points from the camera into the scene, while
                // the phase function needs the direction from the sample back
                // to the camera. The old sign inverted forward scattering and
                // made real camera-facing shafts almost disappear.
                float phase = henyeyGreenstein(dot(toLight, -viewDirection), anisotropy);
                int shadowSlot = int(floor(coneShadow.z + 0.5));
                float visibility = receiveShadows ? lightShadow(shadowSlot, worldPoint) : 1.0;
                // A small fill approximates unresolved multiple scattering for
                // fog and clouds. Light-shaft presets leave it at zero so a
                // fully occluded sample contributes no visible medium.
                visibility = mix(shadowFill, 1.0, visibility);
                lighting += colorIntensity.rgb * colorIntensity.w * attenuation * phase * visibility;
            }
            return max(lighting, vec3(0.0));
        }

        void main() {
            float sceneDepth = texture2D(tSceneDepth, vUv).x;
            float cubeDepth = texture2D(tCubeDepth, vUv).x;
            if (uHelperMask && solidDepth(sceneDepth)) {
                if (!solidDepth(cubeDepth)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
                float sceneZ = abs(viewPosition(vUv, sceneDepth).z);
                float cubeZ = abs(viewPosition(vUv, cubeDepth).z);
                if (abs(sceneZ - cubeZ) > max(0.012, cubeZ * 0.00045)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }

            vec3 nearView = viewPosition(vUv, 0.0);
            vec3 farView = viewPosition(vUv, 1.0);
            vec3 nearWorld = (uCameraWorld * vec4(nearView, 1.0)).xyz;
            vec3 farWorld = (uCameraWorld * vec4(farView, 1.0)).xyz;
            vec3 rayOrigin = uOrthographic ? nearWorld : uCameraPosition;
            vec3 rayDirection = normalize(farWorld - rayOrigin);
            float sceneDistance = uCameraFar;
            if (solidDepth(cubeDepth)) sceneDistance = length(worldPosition(vUv, cubeDepth) - rayOrigin);

            float rayStart = 1.0e20;
            float rayEnd = -1.0;
            for (int volumeIndex = 0; volumeIndex < MAX_VOLUMES; volumeIndex++) {
                if (volumeIndex >= uVolumeCount) continue;
                vec2 interval;
                if (volumeInterval(volumeIndex, rayOrigin, rayDirection, interval)) {
                    rayStart = min(rayStart, interval.x);
                    rayEnd = max(rayEnd, min(interval.y, sceneDistance));
                }
            }
            if (rayEnd <= rayStart || rayStart >= sceneDistance) {
                gl_FragColor = vec4(0.0);
                return;
            }

            rayStart = max(rayStart, 0.0);
            rayEnd = min(rayEnd, sceneDistance);
            float stepLength = (rayEnd - rayStart) / float(max(uSteps, 1));
            vec2 globalPixel = floor(gl_FragCoord.xy * uFramePixelScale + uFrameOrigin);
            float temporalSlice = uTemporalJitter ? floor(uTime * 24.0) : 0.0;
            float jitter = hash13(vec3(globalPixel, temporalSlice));
            float distanceAlongRay = rayStart + stepLength * jitter;
            vec3 transmittance = vec3(1.0);
            vec3 accumulated = vec3(0.0);

            for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
                if (stepIndex >= uSteps || distanceAlongRay >= rayEnd) break;
                vec3 worldPoint = rayOrigin + rayDirection * distanceAlongRay;
                vec3 scatteringSource = vec3(0.0);
                vec3 extinctionColor = vec3(0.0);
                for (int volumeIndex = 0; volumeIndex < MAX_VOLUMES; volumeIndex++) {
                    if (volumeIndex >= uVolumeCount) continue;
                    float density = sampleVolumeDensity(volumeIndex, worldPoint);
                    if (density <= 0.000001) continue;
                    float scattering = uVolumeOptics[volumeIndex].y;
                    float absorption = uVolumeOptics[volumeIndex].z;
                    vec3 sigmaS = uVolumeColor[volumeIndex] * scattering * density;
                    vec3 sigmaA = uVolumeAbsorptionColor[volumeIndex] * absorption * density;
                    float bloomContribution = uVolumeFlags[volumeIndex].z;
                    bool lightShaft = uVolumeFlags[volumeIndex].w > 0.5;
                    vec3 lightEnergy = volumeLighting(volumeIndex, worldPoint, rayDirection);
                    scatteringSource += sigmaS * lightEnergy * (uBloomPass ? bloomContribution : 1.0);
                    // Physical media attenuate the scene with Beer-Lambert.
                    // Artistic God Rays are emissive shafts: applying the same
                    // extinction in a shadow produced an opaque black volume.
                    // Keeping their extinction at zero makes unlit samples
                    // transparent while lit samples compose additively.
                    if (!lightShaft) extinctionColor += sigmaS + sigmaA;
                }
                float extinction = dot(extinctionColor, vec3(0.2126, 0.7152, 0.0722));
                if (extinction > 0.000001) {
                    float stepTransmission = exp(-extinction * stepLength);
                    vec3 integratedScatter = scatteringSource * ((1.0 - stepTransmission) / extinction);
                    accumulated += transmittance * integratedScatter;
                    transmittance *= stepTransmission;
                } else {
                    accumulated += transmittance * scatteringSource * stepLength;
                }
                if (max(transmittance.r, max(transmittance.g, transmittance.b)) < 0.008) break;
                distanceAlongRay += stepLength;
            }

            float opacity = 1.0 - dot(transmittance, vec3(0.2126, 0.7152, 0.0722));
            if (uBloomPass) opacity = clamp(max(accumulated.r, max(accumulated.g, accumulated.b)), 0.0, 1.0);
            gl_FragColor = vec4(max(accumulated, vec3(0.0)), clamp(opacity, 0.0, 1.0));
        }
    `;

    const COMPOSITE_FRAGMENT_SHADER = `
        precision highp float;
        uniform sampler2D tVolume;
        uniform sampler2D tSceneDepth;
        uniform sampler2D tCubeDepth;
        uniform mat4 uInverseProjection;
        uniform vec2 uVolumeTexel;
        uniform bool uHelperMask;
        uniform bool uBilateralUpsample;
        uniform bool uBloomComposite;
        uniform float uBloomMultiplier;
        varying vec2 vUv;

        bool solidDepth(float depth) { return depth > 0.000001 && depth < 0.999999; }
        float viewZ(vec2 uv, float depth) {
            vec4 point = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            return abs(point.z / max(abs(point.w), 0.000001));
        }
        float bilateralWeight(float centerDepth, vec2 uv) {
            float sampleDepth = texture2D(tCubeDepth, uv).x;
            bool centerSolid = solidDepth(centerDepth);
            bool sampleSolid = solidDepth(sampleDepth);
            if (centerSolid != sampleSolid) return 0.002;
            if (!centerSolid) return 1.0;
            float difference = abs(viewZ(vUv, centerDepth) - viewZ(uv, sampleDepth));
            return exp(-difference * 7.5);
        }
        vec4 finalizeVolume(vec4 color) {
            if (!uBloomComposite) return color;
            color.rgb *= uBloomMultiplier;
            color.a = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
            return color;
        }
        void main() {
            float sceneDepth = texture2D(tSceneDepth, vUv).x;
            float cubeDepth = texture2D(tCubeDepth, vUv).x;
            if (uHelperMask && solidDepth(sceneDepth)) {
                if (!solidDepth(cubeDepth) || abs(viewZ(vUv, sceneDepth) - viewZ(vUv, cubeDepth)) > max(0.012, viewZ(vUv, cubeDepth) * 0.00045)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }
            if (!uBilateralUpsample) {
                gl_FragColor = finalizeVolume(texture2D(tVolume, vUv));
                return;
            }
            vec4 color = texture2D(tVolume, vUv) * 2.0;
            float weight = 2.0;
            vec2 uv0 = clamp(vUv + vec2(-uVolumeTexel.x, 0.0), vec2(0.0), vec2(1.0));
            vec2 uv1 = clamp(vUv + vec2( uVolumeTexel.x, 0.0), vec2(0.0), vec2(1.0));
            vec2 uv2 = clamp(vUv + vec2(0.0, -uVolumeTexel.y), vec2(0.0), vec2(1.0));
            vec2 uv3 = clamp(vUv + vec2(0.0,  uVolumeTexel.y), vec2(0.0), vec2(1.0));
            float weight0 = bilateralWeight(cubeDepth, uv0);
            float weight1 = bilateralWeight(cubeDepth, uv1);
            float weight2 = bilateralWeight(cubeDepth, uv2);
            float weight3 = bilateralWeight(cubeDepth, uv3);
            color += texture2D(tVolume, uv0) * weight0;
            color += texture2D(tVolume, uv1) * weight1;
            color += texture2D(tVolume, uv2) * weight2;
            color += texture2D(tVolume, uv3) * weight3;
            weight += weight0 + weight1 + weight2 + weight3;
            gl_FragColor = finalizeVolume(color / max(weight, 0.0001));
        }
    `;

    function createDepthTexture() {
        const texture = new THREE.DepthTexture(1, 1);
        texture.type = THREE.UnsignedShortType || THREE.UnsignedIntType;
        texture.format = THREE.DepthFormat;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
    }

    function createDepthTarget() {
        const depthTexture = createDepthTexture();
        const target = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            stencilBuffer: false,
            depthTexture
        });
        if (!target.depthTexture) target.depthTexture = depthTexture;
        return target;
    }

    function configureRenderTarget(target, width, height) {
        if (!target) return;
        target.viewport?.set?.(0, 0, width, height);
        target.scissor?.set?.(0, 0, width, height);
        target.scissorTest = false;
    }

    function createWhiteTexture() {
        const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    function createNoiseTexture(size) {
        const dimension = Math.max(32, Math.round(size || 128));
        const data = new Uint8Array(dimension * dimension * 4);
        const hash = (x, y, seed) => {
            let value = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
            value = (value ^ (value >>> 13)) * 1274126177;
            return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
        };
        const sampleGrid = (x, y, cells, seed) => {
            const gx = x / dimension * cells;
            const gy = y / dimension * cells;
            const x0 = Math.floor(gx) % cells;
            const y0 = Math.floor(gy) % cells;
            const x1 = (x0 + 1) % cells;
            const y1 = (y0 + 1) % cells;
            let tx = gx - Math.floor(gx);
            let ty = gy - Math.floor(gy);
            tx = tx * tx * (3 - 2 * tx);
            ty = ty * ty * (3 - 2 * ty);
            const bottom = hash(x0, y0, seed) * (1 - tx) + hash(x1, y0, seed) * tx;
            const top = hash(x0, y1, seed) * (1 - tx) + hash(x1, y1, seed) * tx;
            return bottom * (1 - ty) + top * ty;
        };
        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                for (let channel = 0; channel < 3; channel++) {
                    let value = 0;
                    let amplitude = 0.56;
                    let total = 0;
                    for (let octave = 0; octave < 4; octave++) {
                        value += sampleGrid(x, y, 4 << octave, 17 + channel * 37 + octave * 11) * amplitude;
                        total += amplitude;
                        amplitude *= 0.5;
                    }
                    data[(y * dimension + x) * 4 + channel] = Math.round(clamp(value / total, 0, 1) * 255);
                }
                data[(y * dimension + x) * 4 + 3] = 255;
            }
        }
        const texture = new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter || THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

    const AtmosphereManager = {
        settings: readSettings(),
        states: new Map(),
        patchedPreviews: new Map(),
        whiteTexture: null,
        noiseTexture: null,
        studioTile: null,
        studioTime: null,
        sceneRevision: 1,
        scenePartitionCache: null,
        depthMaterialCache: new WeakMap(),
        depthMaterialResources: new Set(),
        activeVolumeCandidates: [],
        activeVolumes: [],
        activeVolumeScratch: null,
        disposed: false,

        init() {
            this.disposed = false;
            this.sceneRevision = 1;
            this.invalidateSceneCache();
            this.activeVolumeScratch = {
                cameraPosition: new THREE.Vector3(),
                center: new THREE.Vector3(),
                scale: new THREE.Vector3(),
                sphere: new THREE.Sphere(),
                viewProjection: new THREE.Matrix4(),
                frustum: new THREE.Frustum()
            };
            this.whiteTexture = createWhiteTexture();
            this.noiseTexture = createNoiseTexture(128);
            this.patchAllPreviews();
        },

        dispose() {
            this.disposed = true;
            this.patchedPreviews.forEach((record, preview) => {
                if (preview && preview.render === record.patchedRender) preview.render = record.originalRender;
            });
            this.patchedPreviews.clear();
            this.states.forEach(state => this.disposeState(state));
            this.states.clear();
            this.depthMaterialResources.forEach(material => material?.dispose?.());
            this.depthMaterialResources.clear();
            this.depthMaterialCache = new WeakMap();
            this.invalidateSceneCache();
            this.activeVolumeCandidates.length = 0;
            this.activeVolumes.length = 0;
            this.activeVolumeScratch = null;
            this.whiteTexture?.dispose?.();
            this.noiseTexture?.dispose?.();
            this.whiteTexture = null;
            this.noiseTexture = null;
            this.studioTile = null;
            this.studioTime = null;
        },

        disposeState(state) {
            if (!state) return;
            state.sceneTarget?.dispose?.();
            state.cubeTarget?.dispose?.();
            state.volumeTarget?.dispose?.();
            state.volumeMaterial?.dispose?.();
            state.compositeMaterial?.dispose?.();
            state.volumeQuad?.geometry?.dispose?.();
            state.compositeQuad?.geometry?.dispose?.();
        },

        invalidateSceneCache() {
            this.scenePartitionCache = null;
            this.invalidateDepthCache();
        },

        invalidateDepthCache() {
            this.sceneRevision = (this.sceneRevision + 1) >>> 0;
            this.states.forEach(state => {
                state.lastFrameSignature = null;
                state.lastNormalVolumeReady = false;
                state.lastDepthSignature = null;
            });
        },

        invalidateVolumeCache() {
            this.states.forEach(state => {
                state.lastFrameSignature = null;
                state.lastNormalVolumeReady = false;
            });
        },

        getActiveVolumes(camera) {
            if (!VolumeElement || !Array.isArray(VolumeElement.all)) return [];
            const scratch = this.activeVolumeScratch;
            if (!scratch || !camera) return VolumeElement.all.filter(volume => volume?.visibility !== false && volume?.enabled !== false).slice(0, MAX_VOLUMES);
            camera.updateMatrixWorld?.(true);
            camera.getWorldPosition?.(scratch.cameraPosition);
            scratch.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            scratch.frustum.setFromProjectionMatrix(scratch.viewProjection);
            this.activeVolumeCandidates.length = 0;
            let candidateIndex = 0;
            for (let index = 0; index < VolumeElement.all.length; index++) {
                const volume = VolumeElement.all[index];
                if (!volume || volume.visibility === false || volume.enabled === false || !volume.mesh || finite(volume.density, 0) <= 0) continue;
                volume.mesh.updateMatrixWorld?.(false);
                scratch.center.setFromMatrixPosition(volume.mesh.matrixWorld);
                scratch.scale.setFromMatrixScale(volume.mesh.matrixWorld);
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                const radius = 0.5 * Math.hypot(
                    Math.abs(finite(size[0], 16) * scratch.scale.x),
                    Math.abs(finite(size[1], 16) * scratch.scale.y),
                    Math.abs(finite(size[2], 16) * scratch.scale.z)
                );
                scratch.sphere.center.copy(scratch.center);
                scratch.sphere.radius = Math.max(0.001, radius);
                if (this.settings.frustum_culling && !scratch.frustum.intersectsSphere(scratch.sphere)) continue;
                const candidate = this.activeVolumeCandidates[candidateIndex] || (this.activeVolumeCandidates[candidateIndex] = {});
                candidate.volume = volume;
                candidate.score = finite(volume.density, 0) * 256 + radius * 0.02 - scratch.center.distanceToSquared(scratch.cameraPosition) * 0.0001;
                candidateIndex++;
            }
            this.activeVolumeCandidates.length = candidateIndex;
            this.activeVolumeCandidates.sort((first, second) => second.score - first.score);
            const activeCount = Math.min(MAX_VOLUMES, candidateIndex);
            this.activeVolumes.length = activeCount;
            for (let index = 0; index < activeCount; index++) this.activeVolumes[index] = this.activeVolumeCandidates[index].volume;
            return this.activeVolumes;
        },

        createState(preview) {
            const renderer = preview?.renderer;
            if (!renderer || !THREE.WebGLRenderTarget || !THREE.DepthTexture) return null;
            const sceneTarget = createDepthTarget();
            const cubeTarget = createDepthTarget();
            const volumeTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            });
            const volumeInverse = Array.from({ length: MAX_VOLUMES }, () => new THREE.Matrix4());
            const volumeShapeMode = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeOptics = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeHeightNoise = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeCloudWind = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeFlags = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeColor = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector3());
            const volumeAbsorptionColor = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector3());
            const lightPositionType = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightDirectionRange = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightColorIntensity = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightConeShadow = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const volumeUniforms = {
                tSceneDepth: { value: sceneTarget.depthTexture },
                tCubeDepth: { value: cubeTarget.depthTexture },
                uNoiseTexture: { value: this.noiseTexture },
                uShadowMap0: { value: this.whiteTexture },
                uShadowMap1: { value: this.whiteTexture },
                uInverseProjection: { value: new THREE.Matrix4() },
                uCameraWorld: { value: new THREE.Matrix4() },
                uVolumeInverse: { value: volumeInverse },
                uShadowMatrix0: { value: new THREE.Matrix4() },
                uShadowMatrix1: { value: new THREE.Matrix4() },
                uVolumeShapeMode: { value: volumeShapeMode },
                uVolumeOptics: { value: volumeOptics },
                uVolumeHeightNoise: { value: volumeHeightNoise },
                uVolumeCloudWind: { value: volumeCloudWind },
                uVolumeFlags: { value: volumeFlags },
                uVolumeColor: { value: volumeColor },
                uVolumeAbsorptionColor: { value: volumeAbsorptionColor },
                uLightPositionType: { value: lightPositionType },
                uLightDirectionRange: { value: lightDirectionRange },
                uLightColorIntensity: { value: lightColorIntensity },
                uLightConeShadow: { value: lightConeShadow },
                uShadowParams0: { value: new THREE.Vector4(1, 1, 0.0005, 1) },
                uShadowParams1: { value: new THREE.Vector4(1, 1, 0.0005, 1) },
                uResolution: { value: new THREE.Vector2(1, 1) },
                uFrameOrigin: { value: new THREE.Vector2() },
                uFramePixelScale: { value: new THREE.Vector2(1, 1) },
                uCameraPosition: { value: new THREE.Vector3() },
                uAmbientColor: { value: new THREE.Vector3(1, 1, 1) },
                uCameraFar: { value: 1000 },
                uTime: { value: 0 },
                uVolumeCount: { value: 0 },
                uLightCount: { value: 0 },
                uSteps: { value: 40 },
                uShadowSamples: { value: 1 },
                uOrthographic: { value: false },
                uTemporalJitter: { value: true },
                uHelperMask: { value: true },
                uBloomPass: { value: false }
            };
            const volumeMaterial = new THREE.ShaderMaterial({
                uniforms: volumeUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: VOLUME_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            const compositeUniforms = {
                tVolume: { value: volumeTarget.texture },
                tSceneDepth: { value: sceneTarget.depthTexture },
                tCubeDepth: { value: cubeTarget.depthTexture },
                uInverseProjection: { value: new THREE.Matrix4() },
                uVolumeTexel: { value: new THREE.Vector2(1, 1) },
                uHelperMask: { value: true },
                uBilateralUpsample: { value: true },
                uBloomComposite: { value: false },
                uBloomMultiplier: { value: 1 }
            };
            const compositeMaterial = new THREE.ShaderMaterial({
                uniforms: compositeUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: COMPOSITE_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                blendSrcAlpha: THREE.OneFactor,
                blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
                toneMapped: false
            });
            const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const volumeScene = new THREE.Scene();
            const compositeScene = new THREE.Scene();
            const volumeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volumeMaterial);
            const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
            volumeQuad.frustumCulled = false;
            compositeQuad.frustumCulled = false;
            volumeScene.add(volumeQuad);
            compositeScene.add(compositeQuad);
            const state = {
                preview, renderer, sceneTarget, cubeTarget, volumeTarget,
                volumeMaterial, volumeUniforms, compositeMaterial, compositeUniforms,
                postCamera, volumeScene, compositeScene, volumeQuad, compositeQuad,
                sceneWidth: 1, sceneHeight: 1, volumeWidth: 1, volumeHeight: 1,
                depthWidth: 1, depthHeight: 1,
                rendering: false, ownDepthStamp: 0,
                lastNormalVolumeReady: false,
                lastNormalStudio: false,
                lastBloomMultiplier: 1,
                lastFrameSignature: null,
                lastDepthSignature: null,
                lastDepthSources: null,
                lightCandidates: [],
                lightElementByUuid: new Map(),
                scratch: {
                    scaleMatrix: new THREE.Matrix4(),
                    worldMatrix: new THREE.Matrix4(),
                    position: new THREE.Vector3(),
                    targetPosition: new THREE.Vector3(),
                    direction: new THREE.Vector3(),
                    quaternion: new THREE.Quaternion()
                },
                stats: { raymarches: 0, cacheHits: 0, depthCaptures: 0, culledFrames: 0 }
            };
            this.states.set(preview, state);
            return state;
        },

        resize(state, studio) {
            const renderer = state.renderer;
            const drawingSize = renderer.getDrawingBufferSize
                ? renderer.getDrawingBufferSize(new THREE.Vector2())
                : new THREE.Vector2(renderer.domElement?.width || state.preview.width || 800, renderer.domElement?.height || state.preview.height || 600);
            const sceneWidth = Math.max(2, Math.floor(drawingSize.x));
            const sceneHeight = Math.max(2, Math.floor(drawingSize.y));
            const requestedScale = studio ? this.settings.render_scale : this.settings.preview_scale;
            const studioSamples = studio
                ? clamp(parseInt(this.studioTile?.settings?.samples, 10) || 1, 1, 8)
                : 1;
            // Studio Render already supersamples the scene. Ray marching at
            // that multiplied resolution repeats nearly identical work, so
            // keep Atmosphere near final-output resolution instead.
            const scale = studio
                ? clamp(finite(requestedScale, 1) / studioSamples, 0.125, 1.0)
                : clamp(finite(requestedScale, 0.5), 0.25, 1.0);
            const volumeWidth = Math.max(2, Math.floor(sceneWidth * scale));
            const volumeHeight = Math.max(2, Math.floor(sceneHeight * scale));
            if (state.sceneWidth !== sceneWidth || state.sceneHeight !== sceneHeight) {
                state.sceneWidth = sceneWidth;
                state.sceneHeight = sceneHeight;
            }
            if (state.volumeWidth !== volumeWidth || state.volumeHeight !== volumeHeight) {
                state.volumeWidth = volumeWidth;
                state.volumeHeight = volumeHeight;
                state.volumeTarget.setSize(volumeWidth, volumeHeight);
                configureRenderTarget(state.volumeTarget, volumeWidth, volumeHeight);
                state.volumeUniforms.uResolution.value.set(volumeWidth, volumeHeight);
                state.compositeUniforms.uVolumeTexel.value.set(1 / volumeWidth, 1 / volumeHeight);
                state.lastNormalVolumeReady = false;
                state.lastFrameSignature = null;
            }
            if (state.depthWidth !== volumeWidth || state.depthHeight !== volumeHeight) {
                state.depthWidth = volumeWidth;
                state.depthHeight = volumeHeight;
                state.sceneTarget.setSize(volumeWidth, volumeHeight);
                state.cubeTarget.setSize(volumeWidth, volumeHeight);
                configureRenderTarget(state.sceneTarget, volumeWidth, volumeHeight);
                configureRenderTarget(state.cubeTarget, volumeWidth, volumeHeight);
                state.lastFrameSignature = null;
                state.lastDepthSignature = null;
            }
            state.compositeUniforms.uBilateralUpsample.value = volumeWidth < sceneWidth || volumeHeight < sceneHeight;
        },

        findFreshSharedSceneDepth(preview, state) {
            const manager = window.LightflowAmbientOcclusion;
            const shared = manager?.states?.get?.(preview);
            if (!manager?.settings?.enabled || !shared || !shared.sceneTarget?.depthTexture) return null;
            const stamp = finite(shared.lightflowDepthStamp, 0);
            if (!stamp || performance.now() - stamp > 80) return null;
            if (shared.sceneWidth !== state.sceneWidth || shared.sceneHeight !== state.sceneHeight) return null;
            return shared.sceneTarget.depthTexture;
        },

        findFreshSharedDepthSources(preview, state) {
            const manager = window.LightflowAmbientOcclusion;
            const shared = manager?.states?.get?.(preview);
            if (!manager?.settings?.enabled || !shared?.sceneTarget?.depthTexture || !shared?.cubeTarget?.depthTexture) return null;
            const stamp = finite(shared.lightflowDepthStamp, 0);
            if (!stamp || performance.now() - stamp > 80) return null;
            if (shared.sceneWidth !== state.sceneWidth || shared.sceneHeight !== state.sceneHeight) return null;
            if (shared.width < state.depthWidth || shared.height < state.depthHeight) return null;

            const allVisibleCubesCovered = getRenderElements().every(cube => {
                const mesh = getCubeMesh(cube);
                if (!mesh || mesh.visible === false) return true;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                return materials.some(material => manager.materialReceivesAO?.(material));
            });
            if (!allVisibleCubesCovered) return null;
            return {
                sceneDepth: this.settings.helper_mask ? shared.sceneTarget.depthTexture : shared.cubeTarget.depthTexture,
                cubeDepth: shared.cubeTarget.depthTexture
            };
        },

        getScenePartition() {
            if (this.scenePartitionCache) return this.scenePartitionCache;
            const cubeObjects = new WeakSet();
            const cubeMeshes = [];
            const nonCubeObjects = [];
            getRenderElements().forEach(element => {
                const mesh = getCubeMesh(element);
                if (!mesh) return;
                const addObject = object => {
                    if (!object || cubeObjects.has(object)) return;
                    cubeObjects.add(object);
                    if (object.isMesh && object.material) cubeMeshes.push(object);
                };
                if (mesh.traverse) mesh.traverse(addObject);
                else addObject(mesh);
            });
            window.Canvas?.scene?.traverse?.(object => {
                const renderable = object?.isMesh || object?.isSprite || object?.isLine || object?.isLineSegments || object?.isPoints;
                if (renderable && !cubeObjects.has(object)) nonCubeObjects.push(object);
            });
            this.scenePartitionCache = { cubeObjects, cubeMeshes, nonCubeObjects };
            return this.scenePartitionCache;
        },

        collectCubeObjects() {
            return this.getScenePartition().cubeObjects;
        },

        collectNonCubeVisibilityChanges(cubeObjects) {
            const changes = [];
            this.getScenePartition().nonCubeObjects.forEach(object => {
                if (object?.visible) {
                    changes.push(object);
                    object.visible = false;
                }
            });
            return changes;
        },

        forceDepthWriting(scene, predicate) {
            const changes = [];
            scene?.traverse?.(object => {
                if (!object?.visible || !predicate(object) || !object.material) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => {
                    if (!material || material.depthWrite === true) return;
                    changes.push({ material, depthWrite: material.depthWrite });
                    material.depthWrite = true;
                });
            });
            return changes;
        },

        hasVisibleHelpers(scene, cubeObjects) {
            let found = false;
            this.getScenePartition().nonCubeObjects.forEach(object => {
                if (found || !object?.visible) return;
                let ancestor = object.parent;
                while (ancestor && ancestor !== scene) {
                    if (ancestor.visible === false) return;
                    ancestor = ancestor.parent;
                }
                if (object.isLine || object.isLineSegments || object.isSprite || object.isPoints) found = true;
            });
            return found;
        },

        getDepthOnlyMaterial(sourceMaterial) {
            if (!sourceMaterial) return sourceMaterial;
            const sharedManager = window.LightflowAmbientOcclusion;
            if (sharedManager?.getDepthOnlyMaterial) {
                const sharedMaterial = sharedManager.getDepthOnlyMaterial(sourceMaterial);
                if (sharedMaterial) sharedMaterial.depthWrite = true;
                return sharedMaterial;
            }
            let material = this.depthMaterialCache.get(sourceMaterial);
            if (!material) {
                material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: null },
                        uHasMap: { value: false },
                        uOpacity: { value: 1 },
                        uAlphaTest: { value: 0.01 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        precision highp float;
                        uniform sampler2D map;
                        uniform bool uHasMap;
                        uniform float uOpacity;
                        uniform float uAlphaTest;
                        varying vec2 vUv;
                        void main() {
                            float alpha = uOpacity;
                            if (uHasMap) alpha *= texture2D(map, vUv).a;
                            if (alpha < uAlphaTest) discard;
                            gl_FragColor = vec4(1.0);
                        }
                    `,
                    depthTest: true,
                    depthWrite: true,
                    colorWrite: false,
                    transparent: false,
                    blending: THREE.NoBlending,
                    side: sourceMaterial.shadowSide !== undefined
                        ? sourceMaterial.shadowSide
                        : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide)
                });
                material.name = 'LightflowAtmosphere_DepthOnly';
                this.depthMaterialCache.set(sourceMaterial, material);
                this.depthMaterialResources.add(material);
            }
            const map = sourceMaterial.uniforms?.map?.value || sourceMaterial.map || null;
            const baseAlpha = sourceMaterial.uniforms?.uBaseAlpha?.value;
            material.uniforms.map.value = map;
            material.uniforms.uHasMap.value = !!map;
            material.uniforms.uOpacity.value = Number.isFinite(Number(baseAlpha))
                ? clamp(Number(baseAlpha), 0, 1)
                : clamp(finite(sourceMaterial.opacity, 1), 0, 1);
            material.uniforms.uAlphaTest.value = Math.max(0.001, finite(sourceMaterial.alphaTest, 0.01));
            material.side = sourceMaterial.shadowSide !== undefined
                ? sourceMaterial.shadowSide
                : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide);
            return material;
        },

        useDepthOnlyCubeMaterials() {
            const changes = [];
            this.getScenePartition().cubeMeshes.forEach(mesh => {
                if (!mesh?.material) return;
                const original = mesh.material;
                mesh.material = Array.isArray(original)
                    ? original.map(material => this.getDepthOnlyMaterial(material))
                    : this.getDepthOnlyMaterial(original);
                changes.push({ mesh, material: original });
            });
            return changes;
        },

        restoreCubeMaterials(changes) {
            (changes || []).forEach(entry => {
                if (entry?.mesh) entry.mesh.material = entry.material;
            });
        },

        restoreMaterialChanges(changes) {
            for (let index = changes.length - 1; index >= 0; index--) {
                changes[index].material.depthWrite = changes[index].depthWrite;
            }
        },

        captureDepth(state, preview) {
            const renderer = state.renderer;
            const camera = preview.camera;
            const scene = window.Canvas?.scene;
            if (!scene || !camera) return null;
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousTargetViewport = previousTarget?.viewport?.clone?.() || null;
            const previousTargetScissor = previousTarget?.scissor?.clone?.() || null;
            const previousTargetScissorTest = previousTarget?.scissorTest ?? false;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
            const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
            const previousScissorTest = renderer.getScissorTest?.() ?? false;
            const previousShadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : undefined;
            const clearColor = new THREE.Color();
            const clearAlpha = renderer.getClearAlpha?.() ?? 1;
            renderer.getClearColor?.(clearColor);
            const sharedSceneDepth = this.findFreshSharedSceneDepth(preview, state);
            try {
                renderer.autoClear = true;
                renderer.setScissorTest?.(false);
                if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
                const cubeObjects = this.collectCubeObjects();
                const needsHelperDepth = !!this.settings.helper_mask && this.hasVisibleHelpers(scene, cubeObjects);
                if (needsHelperDepth && !sharedSceneDepth) {
                    const helperDepthChanges = this.forceDepthWriting(scene, object => {
                        return !cubeObjects.has(object) && (object.isLine || object.isLineSegments || object.isSprite || object.isPoints);
                    });
                    renderer.setRenderTarget(state.sceneTarget);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    try {
                        renderer.render(scene, camera);
                    } finally {
                        this.restoreMaterialChanges(helperDepthChanges);
                    }
                }
                const hidden = this.collectNonCubeVisibilityChanges(cubeObjects);
                const cubeMaterialChanges = this.useDepthOnlyCubeMaterials();
                renderer.setRenderTarget(state.cubeTarget);
                renderer.setClearColor?.(0x000000, 0);
                renderer.clear?.(true, true, true);
                try {
                    renderer.render(scene, camera);
                } finally {
                    this.restoreCubeMaterials(cubeMaterialChanges);
                    hidden.forEach(object => { object.visible = true; });
                }
                state.ownDepthStamp = performance.now();
                state.stats.depthCaptures++;
                return {
                    sceneDepth: needsHelperDepth ? (sharedSceneDepth || state.sceneTarget.depthTexture) : state.cubeTarget.depthTexture,
                    cubeDepth: state.cubeTarget.depthTexture
                };
            } finally {
                if (previousTarget) {
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    previousTarget.scissorTest = previousTargetScissorTest;
                    renderer.setRenderTarget?.(previousTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    if (previousScissor) renderer.setScissor?.(previousScissor);
                    renderer.setScissorTest?.(previousScissorTest);
                }
                renderer.autoClear = previousAutoClear;
                renderer.setClearColor?.(clearColor, clearAlpha);
                if (renderer.shadowMap && previousShadowAutoUpdate !== undefined) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
            }
        },

        updateVolumeUniforms(state, volumes) {
            const uniforms = state.volumeUniforms;
            const scaleMatrix = state.scratch.scaleMatrix;
            const worldMatrix = state.scratch.worldMatrix;
            window.Canvas?.scene?.updateMatrixWorld?.(true);
            for (let index = 0; index < MAX_VOLUMES; index++) {
                const volume = volumes[index];
                if (!volume) {
                    uniforms.uVolumeInverse.value[index].identity();
                    uniforms.uVolumeShapeMode.value[index].set(0, 0, 0.1, 0);
                    uniforms.uVolumeOptics.value[index].set(0, 0, 0, 0);
                    uniforms.uVolumeHeightNoise.value[index].set(0, 0, 1, 1);
                    uniforms.uVolumeCloudWind.value[index].set(0.5, 0.2, 0, 0);
                    uniforms.uVolumeFlags.value[index].set(0, 0, 0, 0);
                    uniforms.uVolumeColor.value[index].set(1, 1, 1);
                    uniforms.uVolumeAbsorptionColor.value[index].set(1, 1, 1);
                    continue;
                }
                volume.mesh.updateMatrixWorld?.(true);
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                scaleMatrix.makeScale(
                    Math.max(0.001, Math.abs(finite(size[0], 16))),
                    Math.max(0.001, Math.abs(finite(size[1], 16))),
                    Math.max(0.001, Math.abs(finite(size[2], 16)))
                );
                worldMatrix.copy(volume.mesh.matrixWorld).multiply(scaleMatrix);
                uniforms.uVolumeInverse.value[index].copy(worldMatrix);
                if (uniforms.uVolumeInverse.value[index].invert) uniforms.uVolumeInverse.value[index].invert();
                else uniforms.uVolumeInverse.value[index].getInverse(worldMatrix);
                const shape = volume.shape === 'sphere' ? 1 : 0;
                const mode = volume.density_mode === 'cloud' ? 2 : (volume.density_mode === 'height' ? 1 : 0);
                uniforms.uVolumeShapeMode.value[index].set(
                    shape,
                    mode,
                    clamp(finite(volume.edge_feather, 0.12), 0.001, 1),
                    clamp(finite(volume.shadow_fill, 0.1), 0, 1)
                );
                uniforms.uVolumeOptics.value[index].set(
                    clamp(finite(volume.density, 0.04), 0, 4),
                    clamp(finite(volume.scattering_strength, 0.9), 0, 8),
                    clamp(finite(volume.absorption, 0.18), 0, 8),
                    clamp(finite(volume.anisotropy, 0.35), -0.92, 0.92)
                );
                uniforms.uVolumeHeightNoise.value[index].set(
                    clamp(finite(volume.height_falloff, 1.2), 0, 16),
                    clamp(finite(volume.height_offset, 0.1), 0, 1),
                    clamp(finite(volume.noise_scale, 3.2), 0.01, 64),
                    clamp(finite(volume.noise_detail, 3), 1, 4)
                );
                const speed = finite(volume.wind_speed, 0);
                const wind = Array.isArray(volume.wind_direction) ? volume.wind_direction : [1, 0];
                uniforms.uVolumeCloudWind.value[index].set(
                    clamp(finite(volume.coverage, 0.45), 0, 0.99),
                    clamp(finite(volume.erosion, 0.22), 0.01, 1),
                    finite(wind[0], 1) * speed,
                    finite(wind[1], 0) * speed
                );
                uniforms.uVolumeFlags.value[index].set(
                    volume.receive_shadows === false ? 0 : 1,
                    clamp(finite(volume.ambient, 0.12), 0, 4),
                    clamp(finite(volume.bloom_contribution, 1), 0, 4),
                    volume.composite_mode === 'shafts' ? 1 : 0
                );
                colorArrayToVector(volume.scattering_color, uniforms.uVolumeColor.value[index]);
                colorArrayToVector(volume.absorption_color, uniforms.uVolumeAbsorptionColor.value[index]);
            }
            uniforms.uVolumeCount.value = volumes.length;
        },

        updateLightUniforms(state) {
            const uniforms = state.volumeUniforms;
            const candidates = state.lightCandidates;
            const elementByUuid = state.lightElementByUuid;
            elementByUuid.clear();
            window.LightElement?.all?.forEach?.(element => {
                if (element?.uuid) elementByUuid.set(element.uuid, element);
            });
            let candidateCount = 0;
            const lights = window.three_lights || {};
            for (const uuid in lights) {
                if (!Object.prototype.hasOwnProperty.call(lights, uuid)) continue;
                const light = lights[uuid];
                if (!light || light.visible === false || finite(light.intensity, 0) <= 0) continue;
                const candidate = candidates[candidateCount] || (candidates[candidateCount] = {});
                candidate.uuid = uuid;
                candidate.light = light;
                candidate.intensity = finite(light.intensity, 0);
                candidateCount++;
            }
            candidates.length = candidateCount;
            candidates.sort((first, second) => second.intensity - first.intensity);
            const lightCount = Math.min(MAX_LIGHTS, candidateCount);
            const position = state.scratch.position;
            const targetPosition = state.scratch.targetPosition;
            const direction = state.scratch.direction;
            let shadowCount = 0;
            for (let index = 0; index < MAX_LIGHTS; index++) {
                const entry = index < lightCount ? candidates[index] : null;
                if (!entry) {
                    uniforms.uLightPositionType.value[index].set(0, 0, 0, 1);
                    uniforms.uLightDirectionRange.value[index].set(0, -1, 0, 0);
                    uniforms.uLightColorIntensity.value[index].set(0, 0, 0, 0);
                    uniforms.uLightConeShadow.value[index].set(-1, 1, -1, 0);
                    continue;
                }
                const { uuid, light } = entry;
                const element = elementByUuid.get(uuid);
                light.getWorldPosition?.(position);
                if (light.target?.getWorldPosition) {
                    light.target.getWorldPosition(targetPosition);
                    direction.copy(targetPosition).sub(position).normalize();
                } else {
                    direction.set(0, 0, -1).applyQuaternion(light.getWorldQuaternion(state.scratch.quaternion)).normalize();
                }
                const type = light.isDirectionalLight ? 0 : (light.isSpotLight ? 2 : 1);
                const range = Math.max(0, finite(light.distance, finite(element?.distance, 0)));
                uniforms.uLightPositionType.value[index].set(position.x, position.y, position.z, type);
                uniforms.uLightDirectionRange.value[index].set(direction.x, direction.y, direction.z, range);
                uniforms.uLightColorIntensity.value[index].set(
                    finite(light.color?.r, 1), finite(light.color?.g, 1), finite(light.color?.b, 1),
                    clamp(finite(light.intensity, finite(element?.render_intensity, 1)), 0, 100000)
                );
                const angle = clamp(finite(light.angle, THREE.MathUtils.degToRad(finite(element?.angle, 45))), 0.001, Math.PI * 0.499);
                const penumbra = clamp(finite(light.penumbra, finite(element?.penumbra, 0)), 0, 1);
                const outerCos = Math.cos(angle);
                const innerCos = Math.cos(angle * (1 - penumbra));
                let shadowSlot = -1;
                const mayShadow = type !== 1 && element?.has_shadow !== false && light.castShadow !== false && light.shadow?.map?.texture && shadowCount < MAX_SHADOWS;
                if (mayShadow) {
                    shadowSlot = shadowCount++;
                    const textureUniform = shadowSlot === 0 ? uniforms.uShadowMap0 : uniforms.uShadowMap1;
                    const matrixUniform = shadowSlot === 0 ? uniforms.uShadowMatrix0 : uniforms.uShadowMatrix1;
                    const paramsUniform = shadowSlot === 0 ? uniforms.uShadowParams0 : uniforms.uShadowParams1;
                    textureUniform.value = light.shadow.map.texture;
                    matrixUniform.value.copy(light.shadow.matrix);
                    const mapWidth = finite(light.shadow.map.width, finite(light.shadow.mapSize?.x, 1024));
                    const mapHeight = finite(light.shadow.map.height, finite(light.shadow.mapSize?.y, 1024));
                    paramsUniform.value.set(
                        Math.max(1, mapWidth), Math.max(1, mapHeight),
                        finite(light.shadow.bias, finite(element?.shadow_bias, -0.0005)),
                        clamp(finite(element?.shadow_softness, 1), 0, 12)
                    );
                }
                uniforms.uLightConeShadow.value[index].set(outerCos, innerCos, shadowSlot, 0);
            }
            if (shadowCount < 1) {
                uniforms.uShadowMap0.value = this.whiteTexture;
                uniforms.uShadowMatrix0.value.identity();
                uniforms.uShadowParams0.value.set(1, 1, 0, 0);
            }
            if (shadowCount < 2) {
                uniforms.uShadowMap1.value = this.whiteTexture;
                uniforms.uShadowMatrix1.value.identity();
                uniforms.uShadowParams1.value.set(1, 1, 0, 0);
            }
            uniforms.uLightCount.value = lightCount;
        },

        hashNumber(hash, value) {
            const quantized = Math.round(finite(value, 0) * 100000);
            return Math.imul((hash ^ quantized) >>> 0, 16777619) >>> 0;
        },

        hashString(hash, value) {
            const text = String(value || '');
            for (let index = 0; index < text.length; index++) {
                hash = Math.imul((hash ^ text.charCodeAt(index)) >>> 0, 16777619) >>> 0;
            }
            return hash;
        },

        hashArray(hash, values) {
            if (!values) return this.hashNumber(hash, 0);
            for (let index = 0; index < values.length; index++) hash = this.hashNumber(hash, values[index]);
            return hash;
        },

        computeFrameSignature(state, preview, volumes, studio) {
            let hash = 2166136261;
            hash = this.hashNumber(hash, this.sceneRevision);
            hash = this.hashNumber(hash, state.sceneWidth);
            hash = this.hashNumber(hash, state.sceneHeight);
            hash = this.hashNumber(hash, state.volumeWidth);
            hash = this.hashNumber(hash, state.volumeHeight);
            hash = this.hashString(hash, studio ? this.settings.render_quality : this.settings.preview_quality);
            hash = this.hashNumber(hash, this.settings.helper_mask ? 1 : 0);
            hash = this.hashNumber(hash, this.settings.temporal_jitter ? 1 : 0);
            const camera = preview.camera;
            hash = this.hashArray(hash, camera?.matrixWorld?.elements);
            hash = this.hashArray(hash, camera?.projectionMatrix?.elements);
            hash = this.hashNumber(hash, camera?.near);
            hash = this.hashNumber(hash, camera?.far);

            let animated = !!this.settings.temporal_jitter;
            volumes.forEach(volume => {
                hash = this.hashString(hash, volume.uuid);
                hash = this.hashArray(hash, volume.mesh?.matrixWorld?.elements);
                hash = this.hashArray(hash, volume.size);
                hash = this.hashString(hash, volume.shape);
                hash = this.hashString(hash, volume.density_mode);
                hash = this.hashString(hash, volume.composite_mode);
                hash = this.hashNumber(hash, volume.density);
                hash = this.hashNumber(hash, volume.scattering_strength);
                hash = this.hashNumber(hash, volume.absorption);
                hash = this.hashNumber(hash, volume.anisotropy);
                hash = this.hashNumber(hash, volume.ambient);
                hash = this.hashNumber(hash, volume.shadow_fill);
                hash = this.hashNumber(hash, volume.edge_feather);
                hash = this.hashNumber(hash, volume.height_falloff);
                hash = this.hashNumber(hash, volume.height_offset);
                hash = this.hashNumber(hash, volume.noise_scale);
                hash = this.hashNumber(hash, volume.noise_detail);
                hash = this.hashNumber(hash, volume.coverage);
                hash = this.hashNumber(hash, volume.erosion);
                hash = this.hashNumber(hash, volume.wind_speed);
                hash = this.hashArray(hash, volume.wind_direction);
                hash = this.hashArray(hash, volume.scattering_color);
                hash = this.hashArray(hash, volume.absorption_color);
                hash = this.hashNumber(hash, volume.receive_shadows === false ? 0 : 1);
                hash = this.hashNumber(hash, volume.bloom_contribution);
                if (volume.density_mode === 'cloud' && Math.abs(finite(volume.wind_speed, 0)) > 0.00001) animated = true;
            });

            const lights = window.three_lights || {};
            for (const uuid in lights) {
                if (!Object.prototype.hasOwnProperty.call(lights, uuid)) continue;
                const light = lights[uuid];
                if (!light || light.visible === false || finite(light.intensity, 0) <= 0) continue;
                hash = this.hashString(hash, uuid);
                hash = this.hashArray(hash, light.matrixWorld?.elements);
                hash = this.hashArray(hash, light.target?.matrixWorld?.elements);
                hash = this.hashNumber(hash, light.intensity);
                hash = this.hashNumber(hash, light.distance);
                hash = this.hashNumber(hash, light.angle);
                hash = this.hashNumber(hash, light.penumbra);
                hash = this.hashNumber(hash, light.color?.r);
                hash = this.hashNumber(hash, light.color?.g);
                hash = this.hashNumber(hash, light.color?.b);
                hash = this.hashNumber(hash, light.castShadow === false ? 0 : 1);
                hash = this.hashArray(hash, light.shadow?.matrix?.elements);
                hash = this.hashNumber(hash, light.shadow?.bias);
            }
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            if (tile) {
                hash = this.hashNumber(hash, tile.viewX);
                hash = this.hashNumber(hash, tile.viewY);
                hash = this.hashNumber(hash, tile.viewWidth);
                hash = this.hashNumber(hash, tile.viewHeight);
                hash = this.hashNumber(hash, tile.sampleX);
                hash = this.hashNumber(hash, tile.sampleY);
            }
            if (window.Timeline?.playing) animated = true;
            if (animated && !studio) hash = this.hashNumber(hash, Math.floor(performance.now() / 33));
            return hash >>> 0;
        },

        computeDepthSignature(state, preview, studio) {
            let hash = 2166136261;
            hash = this.hashNumber(hash, this.sceneRevision);
            hash = this.hashNumber(hash, state.depthWidth);
            hash = this.hashNumber(hash, state.depthHeight);
            hash = this.hashNumber(hash, this.settings.helper_mask ? 1 : 0);
            const camera = preview.camera;
            hash = this.hashArray(hash, camera?.matrixWorld?.elements);
            hash = this.hashArray(hash, camera?.projectionMatrix?.elements);
            hash = this.hashNumber(hash, camera?.near);
            hash = this.hashNumber(hash, camera?.far);
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            if (tile) {
                hash = this.hashNumber(hash, tile.viewX);
                hash = this.hashNumber(hash, tile.viewY);
                hash = this.hashNumber(hash, tile.viewWidth);
                hash = this.hashNumber(hash, tile.viewHeight);
                hash = this.hashNumber(hash, tile.sampleX);
                hash = this.hashNumber(hash, tile.sampleY);
            }
            return hash >>> 0;
        },

        performance() {
            const result = { states: this.states.size, raymarches: 0, cacheHits: 0, depthCaptures: 0, cacheHitRate: 0 };
            this.states.forEach(state => {
                result.raymarches += state.stats.raymarches;
                result.cacheHits += state.stats.cacheHits;
                result.depthCaptures += state.stats.depthCaptures;
            });
            const total = result.raymarches + result.cacheHits;
            result.cacheHitRate = total ? result.cacheHits / total : 0;
            return result;
        },

        updateUniforms(state, preview, volumes, studio, bloomPass, depthSources) {
            const camera = preview.camera;
            camera.updateMatrixWorld?.(true);
            const inverseProjection = state.volumeUniforms.uInverseProjection.value;
            if (camera.projectionMatrixInverse) inverseProjection.copy(camera.projectionMatrixInverse);
            else if (inverseProjection.invert) inverseProjection.copy(camera.projectionMatrix).invert();
            else inverseProjection.getInverse(camera.projectionMatrix);
            state.volumeUniforms.uCameraWorld.value.copy(camera.matrixWorld);
            camera.getWorldPosition?.(state.volumeUniforms.uCameraPosition.value);
            state.volumeUniforms.uCameraFar.value = Math.max(1, finite(camera.far, 1000));
            state.volumeUniforms.uOrthographic.value = !!camera.isOrthographicCamera;
            state.volumeUniforms.uTemporalJitter.value = !!this.settings.temporal_jitter;
            state.volumeUniforms.uHelperMask.value = !!this.settings.helper_mask;
            state.volumeUniforms.uBloomPass.value = !!bloomPass;
            const quality = studio ? this.settings.render_quality : this.settings.preview_quality;
            const table = studio ? RENDER_STEPS : PREVIEW_STEPS;
            state.volumeUniforms.uSteps.value = Math.min(MAX_RAY_STEPS, table[quality] || (studio ? 64 : 24));
            state.volumeUniforms.uShadowSamples.value = studio && quality === 'ultra' ? 4 : 1;
            if (studio) {
                if (this.studioTime === null) this.studioTime = performance.now() * 0.001;
                state.volumeUniforms.uTime.value = this.studioTime;
            } else {
                this.studioTime = null;
                state.volumeUniforms.uTime.value = performance.now() * 0.001;
            }
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            const volumeToRenderX = state.sceneWidth / Math.max(1, state.volumeWidth);
            const volumeToRenderY = state.sceneHeight / Math.max(1, state.volumeHeight);
            const viewScaleX = tile ? finite(tile.viewWidth, state.sceneWidth) / Math.max(1, finite(tile.renderWidth, state.sceneWidth)) : 1;
            const viewScaleY = tile ? finite(tile.viewHeight, state.sceneHeight) / Math.max(1, finite(tile.renderHeight, state.sceneHeight)) : 1;
            state.volumeUniforms.uFrameOrigin.value.set(
                tile ? finite(tile.viewX, finite(tile.sampleX, 0) - finite(tile.cropX, 0)) : 0,
                tile ? finite(tile.fullViewHeight, state.sceneHeight) - finite(tile.viewY, 0) - finite(tile.viewHeight, state.sceneHeight) : 0
            );
            state.volumeUniforms.uFramePixelScale.value.set(
                volumeToRenderX * viewScaleX,
                volumeToRenderY * viewScaleY
            );
            state.volumeUniforms.tSceneDepth.value = depthSources.sceneDepth;
            state.volumeUniforms.tCubeDepth.value = depthSources.cubeDepth;
            state.compositeUniforms.tSceneDepth.value = depthSources.sceneDepth;
            state.compositeUniforms.tCubeDepth.value = depthSources.cubeDepth;
            state.compositeUniforms.uInverseProjection.value.copy(inverseProjection);
            state.compositeUniforms.uHelperMask.value = !!this.settings.helper_mask;
            this.updateVolumeUniforms(state, volumes);
            this.updateLightUniforms(state);
        },

        composite(preview, options) {
            const settings = options || {};
            if (this.disposed || !this.settings.enabled || !preview?.renderer || !window.Canvas?.scene) return false;
            const volumes = this.getActiveVolumes(preview.camera);
            if (!volumes.length) return false;
            const state = this.states.get(preview) || this.createState(preview);
            if (!state || state.rendering) return false;
            const renderer = state.renderer;
            const studio = !!(preview.sa_studio_render_active || window.LightManagerStudioRenderSession || settings.studio || settings.bloomMask);
            state.rendering = true;
            this.resize(state, studio);
            const frameSignature = this.computeFrameSignature(state, preview, volumes, studio);
            const depthSignature = this.computeDepthSignature(state, preview, studio);
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousTargetViewport = previousTarget?.viewport?.clone?.() || null;
            const previousTargetScissor = previousTarget?.scissor?.clone?.() || null;
            const previousTargetScissorTest = previousTarget?.scissorTest ?? false;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
            const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
            const previousScissorTest = renderer.getScissorTest?.() ?? false;
            const previousClearColor = new THREE.Color();
            const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
            renderer.getClearColor?.(previousClearColor);
            try {
                const sameNormalFrame = state.lastNormalVolumeReady &&
                    state.lastNormalStudio === studio &&
                    state.lastFrameSignature === frameSignature;
                const useCachedBloom = !!settings.bloomMask && sameNormalFrame;
                const useCachedNormal = !settings.bloomMask && !!this.settings.static_cache && sameNormalFrame;
                if (!useCachedBloom && !useCachedNormal) {
                    // AO runs immediately before Atmosphere in the Lightflow
                    // pipeline. Reuse its fresh depth buffers when they cover
                    // every visible cube; this removes two full scene draws
                    // per tile while preserving alpha-tested foliage depth.
                    const sharedDepth = this.findFreshSharedDepthSources(preview, state);
                    const cachedDepth = state.lastDepthSignature === depthSignature
                        ? state.lastDepthSources
                        : null;
                    const depthSources = sharedDepth || cachedDepth || this.captureDepth(state, preview);
                    if (!depthSources) return false;
                    state.lastDepthSources = depthSources;
                    state.lastDepthSignature = depthSignature;
                    this.updateUniforms(state, preview, volumes, studio, !!settings.bloomMask, depthSources);
                    renderer.autoClear = true;
                    renderer.setScissorTest?.(false);
                    renderer.setRenderTarget?.(state.volumeTarget);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    renderer.render(state.volumeScene, state.postCamera);
                    state.stats.raymarches++;
                    if (!settings.bloomMask) {
                        state.lastNormalVolumeReady = true;
                        state.lastNormalStudio = studio;
                        state.lastFrameSignature = frameSignature;
                        state.lastBloomMultiplier = volumes.reduce((maximum, volume) => {
                            return Math.max(maximum, clamp(finite(volume.bloom_contribution, 1), 0, 4));
                        }, 0);
                    } else {
                        state.lastNormalVolumeReady = false;
                        state.lastFrameSignature = null;
                    }
                } else {
                    state.stats.cacheHits++;
                }

                renderer.autoClear = false;
                if (previousTarget) {
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    previousTarget.scissorTest = false;
                    renderer.setRenderTarget?.(previousTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    renderer.setScissorTest?.(false);
                }
                state.compositeUniforms.uBloomComposite.value = !!settings.bloomMask;
                state.compositeUniforms.uBloomMultiplier.value = useCachedBloom ? state.lastBloomMultiplier : 1;
                renderer.render(state.compositeScene, state.postCamera);
                preview.lightflow_atmosphere_done = true;
                return true;
            } catch (error) {
                console.warn('[Lightflow Atmosphere] volume pass failed', error);
                if (!this.renderFailureShown) {
                    this.renderFailureShown = true;
                    Blockbench.showQuickMessage?.(tr('lightflow_atmosphere.message.render_failed', 'Atmosphere disabled after a GPU render error'), 3200);
                }
                this.settings.enabled = false;
                saveSettings(this.settings);
                return false;
            } finally {
                if (previousTarget) {
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    previousTarget.scissorTest = previousTargetScissorTest;
                    renderer.setRenderTarget?.(previousTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    if (previousScissor) renderer.setScissor?.(previousScissor);
                    renderer.setScissorTest?.(previousScissorTest);
                }
                renderer.autoClear = previousAutoClear;
                renderer.setClearColor?.(previousClearColor, previousClearAlpha);
                state.rendering = false;
            }
        },

        prepareStudioTile(event) {
            if (!event?.preview) return;
            this.studioTile = { preview: event.preview, tile: event.tile || {}, settings: event.settings || {} };
            const state = this.states.get(event.preview);
            if (state) state.lastNormalVolumeReady = false;
            this.patchPreview(event.preview);
        },

        patchPreview(preview) {
            if (!preview?.renderer || this.patchedPreviews.has(preview) || typeof preview.render !== 'function') return;
            const originalRender = preview.render;
            const manager = this;
            const patchedRender = function lightflowAtmosphereRender() {
                const hostOwnsPipeline = !!this.lightflow_atmosphere_host_cycle;
                if (!hostOwnsPipeline) {
                    this.lightflow_atmosphere_cycle = true;
                    this.lightflow_atmosphere_done = false;
                }
                let result;
                try {
                    result = originalRender.apply(this, arguments);
                    if (!hostOwnsPipeline && !this.lightflow_atmosphere_done) manager.composite(this);
                } finally {
                    if (!hostOwnsPipeline) {
                        delete this.lightflow_atmosphere_cycle;
                        delete this.lightflow_atmosphere_done;
                    }
                }
                return result;
            };
            preview.render = patchedRender;
            this.patchedPreviews.set(preview, { originalRender, patchedRender });
        },

        patchAllPreviews() {
            collectPreviews().forEach(preview => this.patchPreview(preview));
        }
    };

    function sanitizeVolume(volume) {
        if (!volume) return volume;
        volume.shape = volume.shape === 'sphere' ? 'sphere' : 'box';
        volume.density_mode = ['uniform', 'height', 'cloud'].includes(volume.density_mode) ? volume.density_mode : 'uniform';
        volume.composite_mode = volume.composite_mode === 'shafts' ? 'shafts' : 'physical';
        volume.size = Array.isArray(volume.size) ? volume.size.slice(0, 3) : [32, 16, 32];
        while (volume.size.length < 3) volume.size.push(16);
        volume.size = volume.size.map(value => Math.max(0.01, Math.abs(finite(value, 16))));
        volume.density = clamp(finite(volume.density, 0.04), 0, 4);
        volume.scattering_strength = clamp(finite(volume.scattering_strength, 0.9), 0, 8);
        volume.absorption = clamp(finite(volume.absorption, 0.18), 0, 8);
        volume.anisotropy = clamp(finite(volume.anisotropy, 0.35), -0.92, 0.92);
        volume.edge_feather = clamp(finite(volume.edge_feather, 0.12), 0.001, 1);
        volume.height_falloff = clamp(finite(volume.height_falloff, 1.2), 0, 16);
        volume.height_offset = clamp(finite(volume.height_offset, 0.1), 0, 1);
        volume.noise_scale = clamp(finite(volume.noise_scale, 3.2), 0.01, 64);
        volume.noise_detail = Math.round(clamp(finite(volume.noise_detail, 3), 1, 4));
        volume.coverage = clamp(finite(volume.coverage, 0.45), 0, 0.99);
        volume.erosion = clamp(finite(volume.erosion, 0.22), 0.01, 1);
        volume.wind_speed = clamp(finite(volume.wind_speed, 0), -8, 8);
        volume.ambient = clamp(finite(volume.ambient, 0.12), 0, 4);
        volume.shadow_fill = clamp(finite(volume.shadow_fill, 0.1), 0, 1);
        volume.bloom_contribution = clamp(finite(volume.bloom_contribution, 1), 0, 4);
        return volume;
    }

    function updateVolumeGizmo(volume) {
        const mesh = volume?.mesh;
        if (!mesh) return;
        sanitizeVolume(volume);
        const size = volume.size;
        mesh.visible = volume.visibility !== false;
        if (mesh.boxGizmo) {
            mesh.boxGizmo.visible = volume.shape !== 'sphere';
            mesh.boxGizmo.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.sphereGizmo) {
            mesh.sphereGizmo.visible = volume.shape === 'sphere';
            mesh.sphereGizmo.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.boxSelection) {
            mesh.boxSelection.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.sphereSelection) {
            mesh.sphereSelection.scale.set(size[0], size[1], size[2]);
        }
        const selected = !!volume.selected;
        [mesh.boxSelection, mesh.sphereSelection].forEach(proxy => {
            if (!proxy) return;
            proxy.castShadow = false;
            proxy.receiveShadow = false;
            proxy.userData = proxy.userData || {};
            proxy.userData.lightflowNoShadow = true;
            proxy.userData.lightflowVolumeSelectionProxy = true;
        });
        [mesh.boxGizmo, mesh.sphereGizmo].forEach(gizmo => {
            if (!gizmo?.material) return;
            gizmo.material.color.set(selected ? 0x5ba7ff : 0x67d7e8);
            gizmo.material.opacity = selected ? 0.95 : 0.42;
        });
    }

    function registerVolumeElement() {
        class LightflowVolumeElement extends OutlinerElement {
            constructor(data, uuid) {
                super(data, uuid);
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].reset(this);
                if (data && typeof data === 'object') this.extend(data);
                const legacyGodRays = data && !Object.prototype.hasOwnProperty.call(data, 'composite_mode') &&
                    this.density_mode === 'uniform' && finite(this.scattering_strength, 0) >= 1.15 &&
                    finite(this.absorption, 1) <= 0.05 && finite(this.anisotropy, 0) >= 0.55 &&
                    finite(this.ambient, 1) <= 0.02;
                if (legacyGodRays) {
                    this.composite_mode = 'shafts';
                    this.shadow_fill = 0;
                    this.ambient = 0;
                }
                sanitizeVolume(this);
            }

            get origin() { return this.position; }

            resize(value, axis, negative, allowNegative, bidirectional) {
                if (axis < 0 || axis > 2) return this;

                const oldSize = this.temp_data.old_size || this.size;
                if (this.temp_data.lightflow_resize_size !== oldSize) {
                    this.temp_data.lightflow_resize_size = oldSize;
                    this.temp_data.lightflow_resize_position = this.position.slice();
                }

                const initialSize = Math.max(0.01, Math.abs(finite(oldSize[axis], this.size[axis])));
                const modify = value instanceof Function ? value : size => size + finite(value, 0);
                let requestedSize;

                if (bidirectional) {
                    let difference = modify(initialSize) - initialSize;
                    if (negative) difference *= -1;
                    requestedSize = initialSize + difference * 2;
                } else if (negative) {
                    requestedSize = -modify(-initialSize);
                } else {
                    requestedSize = modify(initialSize);
                }

                const nextSize = Math.max(0.01, finite(requestedSize, initialSize));
                this.size[axis] = nextSize;

                if (!bidirectional) {
                    const initialPosition = this.temp_data.lightflow_resize_position || this.position;
                    const centerShift = (nextSize - initialSize) * (negative ? -0.5 : 0.5);
                    const offset = new THREE.Vector3();
                    offset.setComponent(axis, centerShift);
                    offset.applyEuler(new THREE.Euler(
                        Math.degToRad(this.rotation[0]),
                        Math.degToRad(this.rotation[1]),
                        Math.degToRad(this.rotation[2]),
                        window.Format?.euler_order || 'ZYX'
                    ));
                    this.position[0] = initialPosition[0] + offset.x;
                    this.position[1] = initialPosition[1] + offset.y;
                    this.position[2] = initialPosition[2] + offset.z;
                }

                this.preview_controller.updateTransform(this);
                TickUpdates.selection = true;
                return this;
            }

            extend(object) {
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].merge(this, object);
                sanitizeVolume(this);
                this.sanitizeName();
                return this;
            }

            getUndoCopy() {
                const copy = new LightflowVolumeElement(this);
                copy.uuid = this.uuid;
                delete copy.parent;
                return copy;
            }

            getSaveCopy() {
                const copy = {};
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].copy(this, copy);
                copy.type = 'lightflow_volume';
                copy.uuid = this.uuid;
                return copy;
            }

            select(event, isOutlinerClick) {
                super.select(event, isOutlinerClick);
                updateVolumeGizmo(this);
                syncAtmospherePanel();
                return this;
            }

            unselect(...args) {
                super.unselect(...args);
                updateVolumeGizmo(this);
                syncAtmospherePanel();
            }

            static behavior = {
                unique_name: true,
                movable: true,
                rotatable: true,
                resizable: true,
                hide_in_screenshot: true
            };
        }

        VolumeElement = LightflowVolumeElement;
        publishWindowBinding('LightflowVolumeElement', VolumeElement);
        VolumeElement.prototype.title = 'Volume Domain';
        VolumeElement.prototype.type = 'lightflow_volume';
        VolumeElement.prototype.icon = 'blur_on';
        VolumeElement.prototype.movable = true;
        VolumeElement.prototype.rotatable = true;
        VolumeElement.prototype.resizable = true;
        VolumeElement.prototype.needsUniqueName = true;
        VolumeElement.prototype.name_regex = () => window.Format?.node_name_regex ?? 'a-zA-Z0-9_';
        VolumeElement.prototype.menu = new Menu([
            'edit_lightflow_volume',
            'fit_lightflow_volume',
            '_',
            ...Outliner.control_menu_group,
            '_',
            'rename',
            'delete'
        ]);
        VolumeElement.prototype.buttons = [Outliner.buttons.export, Outliner.buttons.locked, Outliner.buttons.visibility];

        const volumeProperties = [
            new Property(VolumeElement, 'string', 'name', { default: 'Volume Domain' }),
            new Property(VolumeElement, 'string', 'shape', { default: 'box' }),
            new Property(VolumeElement, 'string', 'density_mode', { default: 'uniform' }),
            new Property(VolumeElement, 'string', 'composite_mode', { default: 'physical' }),
            new Property(VolumeElement, 'vector', 'position'),
            new Property(VolumeElement, 'vector', 'rotation'),
            new Property(VolumeElement, 'vector', 'size', { default: [32, 16, 32] }),
            new Property(VolumeElement, 'boolean', 'visibility', { default: true }),
            new Property(VolumeElement, 'boolean', 'enabled', { default: true }),
            new Property(VolumeElement, 'number', 'density', { default: 0.04, min: 0 }),
            new Property(VolumeElement, 'vector', 'scattering_color', { default: [232, 240, 255] }),
            new Property(VolumeElement, 'number', 'scattering_strength', { default: 0.9, min: 0 }),
            new Property(VolumeElement, 'vector', 'absorption_color', { default: [235, 242, 255] }),
            new Property(VolumeElement, 'number', 'absorption', { default: 0.18, min: 0 }),
            new Property(VolumeElement, 'number', 'anisotropy', { default: 0.35 }),
            new Property(VolumeElement, 'number', 'ambient', { default: 0.12, min: 0 }),
            new Property(VolumeElement, 'number', 'shadow_fill', { default: 0.1, min: 0 }),
            new Property(VolumeElement, 'boolean', 'receive_shadows', { default: true }),
            new Property(VolumeElement, 'number', 'bloom_contribution', { default: 1, min: 0 }),
            new Property(VolumeElement, 'number', 'edge_feather', { default: 0.12, min: 0 }),
            new Property(VolumeElement, 'number', 'height_falloff', { default: 1.2, min: 0 }),
            new Property(VolumeElement, 'number', 'height_offset', { default: 0.1, min: 0 }),
            new Property(VolumeElement, 'number', 'noise_scale', { default: 3.2, min: 0.01 }),
            new Property(VolumeElement, 'number', 'noise_detail', { default: 3, min: 1 }),
            new Property(VolumeElement, 'number', 'coverage', { default: 0.45, min: 0 }),
            new Property(VolumeElement, 'number', 'erosion', { default: 0.22, min: 0.01 }),
            new Property(VolumeElement, 'vector', 'wind_direction', { default: [1, 0, 0] }),
            new Property(VolumeElement, 'number', 'wind_speed', { default: 0 })
        ];
        deletables.push(...volumeProperties);

        OutlinerElement.registerType(VolumeElement, 'lightflow_volume');

        volumePreviewController = new NodePreviewController(VolumeElement, {
            setup(element) {
                const mesh = new THREE.Object3D();
                Project.nodes_3d[element.uuid] = mesh;
                mesh.name = element.uuid;
                mesh.type = element.type;
                mesh.isElement = true;
                mesh.userData = mesh.userData || {};
                mesh.userData.lightflowNoShadow = true;
                mesh.rotation.order = window.Format?.euler_order || 'ZYX';

                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x67d7e8,
                    transparent: true,
                    opacity: 0.42,
                    depthTest: true,
                    depthWrite: false
                });
                const boxSourceGeometry = new THREE.BoxGeometry(1, 1, 1);
                const sphereSourceGeometry = new THREE.SphereGeometry(0.5, 16, 10);
                const boxGeometry = new THREE.EdgesGeometry(boxSourceGeometry);
                const sphereGeometry = new THREE.WireframeGeometry(sphereSourceGeometry);
                boxSourceGeometry.dispose();
                sphereSourceGeometry.dispose();
                mesh.boxGizmo = new THREE.LineSegments(boxGeometry, lineMaterial);
                mesh.sphereGizmo = new THREE.LineSegments(sphereGeometry, lineMaterial.clone());
                mesh.boxGizmo.raycast = () => { };
                mesh.sphereGizmo.raycast = () => { };
                mesh.add(mesh.boxGizmo, mesh.sphereGizmo);

                const selectionMaterial = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0,
                    colorWrite: false,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                mesh.boxSelection = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), selectionMaterial);
                mesh.sphereSelection = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), selectionMaterial.clone());
                [mesh.boxSelection, mesh.sphereSelection].forEach(proxy => {
                    proxy.name = element.uuid;
                    proxy.type = element.type;
                    proxy.isElement = true;
                    proxy.castShadow = false;
                    proxy.receiveShadow = false;
                    proxy.userData = proxy.userData || {};
                    proxy.userData.lightflowNoShadow = true;
                    proxy.userData.lightflowVolumeSelectionProxy = true;
                });
                mesh.add(mesh.boxSelection, mesh.sphereSelection);
                mesh.geometry = new THREE.BufferGeometry();
                mesh.geometry.boundingBox = new THREE.Box3().makeEmpty();
                mesh.raycast = function (raycaster, intersects) {
                    const proxy = element.shape === 'sphere' ? this.sphereSelection : this.boxSelection;
                    if (!proxy || this.visible === false) return;
                    proxy.updateMatrixWorld(true);
                    proxy.raycast(raycaster, intersects);
                };
                this.updateTransform(element);
                this.dispatchEvent('setup', { element });
            },
            updateTransform(element) {
                NodePreviewController.prototype.updateTransform.call(this, element);
                updateVolumeGizmo(element);
                AtmosphereManager.invalidateDepthCache();
                requestPreviewRender();
                this.dispatchEvent('update_transform', { element });
            },
            updateSelection(element) {
                updateVolumeGizmo(element);
                this.dispatchEvent('update_selection', { element });
            }
        });
    }

    function getSelectedVolumes() {
        return VolumeElement && Array.isArray(VolumeElement.selected) ? VolumeElement.selected.slice() : [];
    }

    function findSelectionBounds() {
        const selected = getSelectedRenderElements();
        if (!selected.length) return null;
        const bounds = new THREE.Box3();
        let found = false;
        selected.forEach(cube => {
            const mesh = getCubeMesh(cube);
            if (!mesh) return;
            mesh.updateMatrixWorld?.(true);
            bounds.expandByObject(mesh);
            found = true;
        });
        if (!found || bounds.isEmpty()) return null;
        return bounds;
    }

    function fitVolumeToSelection(volume, padding) {
        const bounds = findSelectionBounds();
        if (!volume || !bounds) return false;
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const extra = Math.max(0, finite(padding, 2));
        volume.position = [center.x, center.y, center.z];
        volume.rotation = [0, 0, 0];
        volume.size = [Math.max(0.1, size.x + extra * 2), Math.max(0.1, size.y + extra * 2), Math.max(0.1, size.z + extra * 2)];
        VolumeElement.preview_controller?.updateTransform(volume);
        return true;
    }

    function applyVolumeConfig(volume, config) {
        if (!volume || !config) return;
        const transformKeys = new Set(['position', 'rotation', 'size', 'shape', 'visibility']);
        let transformChanged = false;
        Object.keys(config).forEach(key => {
            if (!VolumeElement.properties[key]) return;
            volume[key] = Array.isArray(config[key]) ? config[key].slice() : config[key];
            if (transformKeys.has(key)) transformChanged = true;
        });
        sanitizeVolume(volume);
        if (transformChanged) {
            VolumeElement.preview_controller?.updateTransform(volume);
        } else {
            updateVolumeGizmo(volume);
            AtmosphereManager.invalidateVolumeCache();
        }
        VolumeElement.preview_controller?.updateSelection(volume);
    }

    function createVolume(presetKey) {
        Undo.initEdit({ outliner: true, elements: [], selection: true });
        const volume = new VolumeElement().addTo().init();
        const preset = VOLUME_PRESETS[presetKey] || VOLUME_PRESETS.soft_mist;
        applyVolumeConfig(volume, preset);
        const bounds = findSelectionBounds();
        if (bounds) fitVolumeToSelection(volume, 3);
        else {
            volume.position = [0, 8, 0];
            VolumeElement.preview_controller?.updateTransform(volume);
        }
        unselectAll();
        volume.select();
        Undo.finishEdit(tr('lightflow_atmosphere.undo.add', 'Add Volume Domain'), { outliner: true, elements: [volume], selection: true });
        Blockbench.dispatchEvent?.('add_lightflow_volume', { object: volume });
        syncAtmospherePanel();
        requestPreviewRender();
        return volume;
    }

    const ATMOSPHERE_DIALOG_SECTIONS = {
        _domain: { label: 'lightflow_atmosphere.group.domain', icon: 'blur_on' },
        _optics: { label: 'lightflow_atmosphere.group.optics', icon: 'lens_blur' },
        _density_shape: { label: 'lightflow_atmosphere.group.shape', icon: 'gradient' },
        _viewport: { label: 'lightflow_atmosphere.group.viewport', icon: 'visibility' },
        _render: { label: 'lightflow_atmosphere.group.render', icon: 'photo_camera' },
        _advanced: { label: 'lightflow_atmosphere.group.performance', icon: 'speed' }
    };

    const ATMOSPHERE_SELECT_ICONS = {
        preset: { custom: 'tune', soft_mist: 'blur_on', godrays: 'flare', clouds: 'cloud', stage_haze: 'filter_hdr', cinematic_dust: 'auto_awesome' },
        shape: { box: 'check_box_outline_blank', sphere: 'circle' },
        density_mode: { uniform: 'blur_on', height: 'gradient', cloud: 'cloud' },
        composite_mode: { physical: 'air', shafts: 'flare' },
        preview_quality: { draft: 'speed', balanced: 'balance', high: 'high_quality', ultra: 'auto_awesome' },
        render_quality: { draft: 'speed', balanced: 'balance', high: 'high_quality', ultra: 'auto_awesome' }
    };

    function getAtmosphereFormUI() {
        const api = window.LightManagerUI;
        const required = ['bar_display', 'combo_slider', 'compact_select', 'custom_checkbox'];
        return api && required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getAtmosphereSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = ATMOSPHERE_SELECT_ICONS[key] || {};
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: tr(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || 'tune'
                }];
            }
            return [optionKey, {
                name: tr(option, option || optionKey),
                icon: iconMap[optionKey] || 'tune'
            }];
        }));
    }

    function enhanceAtmosphereDialogForm(form) {
        if (!getAtmosphereFormUI()) return form;
        const enhanced = {};
        Object.entries(form).forEach(([key, original]) => {
            const section = ATMOSPHERE_DIALOG_SECTIONS[key];
            if (section) {
                enhanced[`atmosphere_section${key}`] = {
                    type: 'bar_display',
                    icon: section.icon,
                    value: tr(section.label, section.label),
                    expand: true,
                    color: 'var(--color-text)'
                };
                return;
            }
            if (!original || typeof original !== 'object') {
                enhanced[key] = original;
                return;
            }
            if (original.type === 'select') {
                enhanced[key] = {
                    ...original,
                    type: 'compact_select',
                    options: getAtmosphereSelectOptions(key, original.options),
                    show_value_text: true,
                    expand: true
                };
                return;
            }
            if (original.type === 'checkbox') {
                enhanced[key] = {
                    ...original,
                    type: 'custom_checkbox',
                    layout: 'space_between',
                    icon_on: 'check_box',
                    icon_off: 'check_box_outline_blank',
                    icon_size: '24px',
                    icon_color_on: 'var(--color-accent)',
                    icon_color_off: 'var(--color-subtle_text)'
                };
                return;
            }
            if (original.type === 'range') {
                const resetValue = DEFAULT_SETTINGS[key];
                enhanced[key] = {
                    ...original,
                    type: 'combo_slider',
                    resettable: Number.isFinite(resetValue),
                    reset_value: Number.isFinite(resetValue) ? resetValue : original.value
                };
                return;
            }
            enhanced[key] = original;
        });
        return enhanced;
    }

    function addAtmosphereDialogStyles() {
        const style = Blockbench.addCSS(`
            #lightflow_atmosphere_volume_dialog .dialog_content,
            #lightflow_atmosphere_settings_dialog .dialog_content {
                scrollbar-gutter: stable;
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"],
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"] {
                min-height: 34px;
                margin: 10px 0 4px;
                padding: 0 8px;
                border-left: 3px solid var(--color-accent);
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-ui) 84%, var(--color-back));
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"]:first-child,
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"]:first-child {
                margin-top: 0;
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"] .bar_display,
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"] .bar_display {
                justify-content: flex-start;
                gap: 7px;
                font-weight: 600;
            }
            #lightflow_atmosphere_volume_dialog .compact_dropdown_select:focus-visible,
            #lightflow_atmosphere_volume_dialog .custom_checkbox:focus-visible,
            #lightflow_atmosphere_settings_dialog .compact_dropdown_select:focus-visible,
            #lightflow_atmosphere_settings_dialog .custom_checkbox:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
            }
            #lightflow_atmosphere_volume_dialog .custom_checkbox:hover,
            #lightflow_atmosphere_settings_dialog .custom_checkbox:hover {
                background: var(--color-button);
            }
        `);
        deletables.push(style);
    }

    function volumeDialogForm(volume) {
        return enhanceAtmosphereDialogForm({
            _domain: '_',
            preset: {
                type: 'select',
                label: 'lightflow_atmosphere.field.preset',
                value: 'custom',
                options: {
                    custom: 'lightflow_atmosphere.option.keep_values',
                    soft_mist: 'lightflow_atmosphere.preset.soft_mist',
                    godrays: 'lightflow_atmosphere.preset.godrays',
                    clouds: 'lightflow_atmosphere.preset.clouds',
                    stage_haze: 'lightflow_atmosphere.preset.stage_haze',
                    cinematic_dust: 'lightflow_atmosphere.preset.cinematic_dust'
                }
            },
            name: { type: 'text', label: 'generic.name', value: volume.name },
            enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: volume.enabled !== false },
            shape: {
                type: 'select', label: 'lightflow_atmosphere.field.shape', value: volume.shape,
                options: { box: 'lightflow_atmosphere.option.box', sphere: 'lightflow_atmosphere.option.sphere' }
            },
            size: { type: 'vector', dimensions: 3, label: 'lightflow_atmosphere.field.size', value: volume.size, min: 0.01 },
            density_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.density_mode', value: volume.density_mode,
                options: { uniform: 'lightflow_atmosphere.option.uniform', height: 'lightflow_atmosphere.option.height', cloud: 'lightflow_atmosphere.option.cloud' }
            },
            composite_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.composite_mode', value: volume.composite_mode,
                options: { physical: 'lightflow_atmosphere.option.physical', shafts: 'lightflow_atmosphere.option.shafts' }
            },
            _optics: '_',
            density: { type: 'number', label: 'lightflow_atmosphere.field.density', value: volume.density, min: 0, max: 4, step: 0.001 },
            scattering_color: { type: 'color', label: 'lightflow_atmosphere.field.scattering_color', value: colorArrayToHex(volume.scattering_color) },
            scattering_strength: { type: 'number', label: 'lightflow_atmosphere.field.scattering', value: volume.scattering_strength, min: 0, max: 8, step: 0.01 },
            absorption_color: { type: 'color', label: 'lightflow_atmosphere.field.absorption_color', value: colorArrayToHex(volume.absorption_color) },
            absorption: { type: 'number', label: 'lightflow_atmosphere.field.absorption', value: volume.absorption, min: 0, max: 8, step: 0.01 },
            anisotropy: { type: 'range', label: 'lightflow_atmosphere.field.anisotropy', value: volume.anisotropy, min: -0.92, max: 0.92, step: 0.01 },
            ambient: { type: 'range', label: 'lightflow_atmosphere.field.ambient', value: volume.ambient, min: 0, max: 2, step: 0.01 },
            receive_shadows: { type: 'checkbox', label: 'lightflow_atmosphere.field.receive_shadows', value: volume.receive_shadows !== false },
            shadow_fill: { type: 'range', label: 'lightflow_atmosphere.field.shadow_fill', value: volume.shadow_fill, min: 0, max: 1, step: 0.01 },
            bloom_contribution: { type: 'range', label: 'lightflow_atmosphere.field.bloom', value: volume.bloom_contribution, min: 0, max: 4, step: 0.05 },
            _density_shape: '_',
            edge_feather: { type: 'range', label: 'lightflow_atmosphere.field.edge_feather', value: volume.edge_feather, min: 0.001, max: 1, step: 0.005 },
            height_falloff: {
                type: 'number', label: 'lightflow_atmosphere.field.height_falloff', value: volume.height_falloff, min: 0, max: 16, step: 0.05,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            height_offset: {
                type: 'range', label: 'lightflow_atmosphere.field.height_offset', value: volume.height_offset, min: 0, max: 1, step: 0.01,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            noise_scale: {
                type: 'number', label: 'lightflow_atmosphere.field.noise_scale', value: volume.noise_scale, min: 0.01, max: 64, step: 0.05,
                condition: form => form.density_mode === 'cloud'
            },
            noise_detail: {
                type: 'range', label: 'lightflow_atmosphere.field.noise_detail', value: volume.noise_detail, min: 1, max: 4, step: 1,
                condition: form => form.density_mode === 'cloud'
            },
            coverage: {
                type: 'range', label: 'lightflow_atmosphere.field.coverage', value: volume.coverage, min: 0, max: 0.99, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            erosion: {
                type: 'range', label: 'lightflow_atmosphere.field.erosion', value: volume.erosion, min: 0.01, max: 1, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            wind_direction: {
                type: 'vector', dimensions: 2, label: 'lightflow_atmosphere.field.wind_direction', value: [volume.wind_direction?.[0] || 0, volume.wind_direction?.[1] || 0],
                condition: form => form.density_mode === 'cloud'
            },
            wind_speed: {
                type: 'number', label: 'lightflow_atmosphere.field.wind_speed', value: volume.wind_speed, min: -8, max: 8, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            }
        });
    }

    function normalizeDialogResult(result, volume) {
        return {
            name: String(result.name || volume.name || 'Volume Domain'),
            enabled: !!result.enabled,
            shape: result.shape === 'sphere' ? 'sphere' : 'box',
            size: Array.isArray(result.size) ? result.size.slice(0, 3) : volume.size,
            density_mode: ['uniform', 'height', 'cloud'].includes(result.density_mode) ? result.density_mode : 'uniform',
            composite_mode: result.composite_mode === 'shafts' ? 'shafts' : 'physical',
            density: finite(result.density, volume.density),
            scattering_color: hexToColorArray(result.scattering_color, volume.scattering_color),
            scattering_strength: finite(result.scattering_strength, volume.scattering_strength),
            absorption_color: hexToColorArray(result.absorption_color, volume.absorption_color),
            absorption: finite(result.absorption, volume.absorption),
            anisotropy: finite(result.anisotropy, volume.anisotropy),
            ambient: finite(result.ambient, volume.ambient),
            shadow_fill: finite(result.shadow_fill, volume.shadow_fill),
            receive_shadows: !!result.receive_shadows,
            bloom_contribution: finite(result.bloom_contribution, volume.bloom_contribution),
            edge_feather: finite(result.edge_feather, volume.edge_feather),
            height_falloff: finite(result.height_falloff, volume.height_falloff),
            height_offset: finite(result.height_offset, volume.height_offset),
            noise_scale: finite(result.noise_scale, volume.noise_scale),
            noise_detail: finite(result.noise_detail, volume.noise_detail),
            coverage: finite(result.coverage, volume.coverage),
            erosion: finite(result.erosion, volume.erosion),
            wind_direction: Array.isArray(result.wind_direction) ? [finite(result.wind_direction[0], 0), finite(result.wind_direction[1], 0), 0] : volume.wind_direction,
            wind_speed: finite(result.wind_speed, volume.wind_speed)
        };
    }

    function openVolumeDialog() {
        const selected = getSelectedVolumes();
        const volume = selected[0];
        if (!volume) return;
        new Dialog('lightflow_atmosphere_volume_dialog', {
            title: selected.length > 1
                ? tr('lightflow_atmosphere.dialog.edit_many', 'Edit Volume Domains') + ` (${selected.length})`
                : tr('lightflow_atmosphere.dialog.edit', 'Volume Domain'),
            width: 640,
            form: volumeDialogForm(volume),
            onConfirm(result) {
                const preset = VOLUME_PRESETS[result.preset];
                const normalized = normalizeDialogResult(result, volume);
                Undo.initEdit({ elements: selected });
                selected.forEach((target, index) => {
                    if (preset) applyVolumeConfig(target, preset);
                    const config = preset
                        ? { enabled: normalized.enabled, shape: normalized.shape, size: normalized.size }
                        : normalized;
                    if (selected.length > 1 || index > 0) delete config.name;
                    applyVolumeConfig(target, config);
                });
                Undo.finishEdit(tr('lightflow_atmosphere.undo.edit', 'Edit Volume Domain'));
                syncAtmospherePanel();
                requestPreviewRender();
            }
        }).show();
    }

    function panelForm(volume) {
        if (!volume) return {
            no_volume: {
                type: 'bar_display', value: tr('lightflow_atmosphere.panel.none', 'Select a Volume Domain'),
                icon: 'blur_on', paragraph: false, expand: true, color: 'var(--color-text)'
            }
        };
        return {
            summary: {
                type: 'bar_display', value: volume.name, icon: volume.density_mode === 'cloud' ? 'cloud' : 'blur_on',
                paragraph: false, expand: true, color: 'var(--color-text)'
            },
            panel_enabled: {
                type: 'action_toggle', value: volume.enabled !== false, description: 'lightflow_atmosphere.field.enabled',
                icon_on: 'blur_on', icon_off: 'blur_off', bg_on: "var(--color-accent)",
                color_on: 'var(--color-ui)', color_off: 'var(--color-subtle_text)', icon_size: '22px'
            },
            panel_mode: {
                type: 'compact_select', label: 'lightflow_atmosphere.field.density_mode', hide_label: true,
                description: 'lightflow_atmosphere.field.density_mode', background: 'transparent', value: volume.density_mode,
                show_value_text: false, expand: false,
                options: {
                    uniform: { name: tr('lightflow_atmosphere.option.uniform', 'Uniform Fog'), icon: 'mist', color: markerColor(9, 'pastel', '#E0E9FB') },
                    height: { name: tr('lightflow_atmosphere.option.height', 'Height Fog'), icon: 'gradient', color: markerColor(0, 'pastel', '#A2EBFF') },
                    cloud: { name: tr('lightflow_atmosphere.option.cloud', 'Procedural Clouds'), icon: 'cloud', color: markerColor(4, 'pastel', '#C5A6E8') }
                }
            },
            panel_composite: {
                type: 'compact_select', label: 'lightflow_atmosphere.field.composite_mode', hide_label: true,
                description: 'lightflow_atmosphere.field.composite_mode', background: 'transparent', value: volume.composite_mode,
                show_value_text: false, expand: false,
                options: {
                    physical: { name: tr('lightflow_atmosphere.option.physical', 'Physical Medium'), icon: 'air', color: markerColor(6, 'pastel', '#7BFFA3') },
                    shafts: { name: tr('lightflow_atmosphere.option.shafts', 'Light Shafts'), icon: 'flare', color: markerColor(1, 'pastel', '#FFF899') }
                }
            },
            panel_density: {
                type: 'combo_slider', label: 'lightflow_atmosphere.field.density', icon: 'opacity',
                color: markerColor(0, 'pastel', '#A2EBFF'), value: volume.density,
                resettable: true, reset_value: 0.032, min: 0, max: 0.3, step: 0.001
            },
            edge_feather: {
                type: 'combo_slider', description: 'lightflow_atmosphere.field.edge_feather', icon: 'deblur',
                color: markerColor(0, 'pastel', '#A2EBFF'), value: volume.edge_feather,
                resettable: true, reset_value: 0.032, min: 0.001, max: 1.0, step: 0.001
            },
            optics_label: {
                type: 'bar_display', icon: 'lens_blur', paragraph: false, expand: true,
                value: tr('lightflow_atmosphere.group.optics', 'Optics & Lighting'),
                color: 'var(--color-subtle_text)', description: 'lightflow_atmosphere.field.scattering'
            },
            panel_scattering: {
                type: 'combo_slider', label: 'lightflow_atmosphere.field.scattering', icon: 'light_mode',
                background: 'transparent', color: markerColor(1, 'pastel', '#FFF899'),
                icon_color: markerColor(1, 'pastel', '#FFF899'), compact: true, popup_width: '360px',
                value: volume.scattering_strength, resettable: true, reset_value: 1, min: 0, max: 4, step: 0.01
            },
            panel_anisotropy: {
                type: 'combo_slider', label: 'lightflow_atmosphere.field.anisotropy', icon: 'compare_arrows',
                background: 'transparent', color: markerColor(8, 'pastel', '#FFA5D5'),
                icon_color: markerColor(8, 'pastel', '#FFA5D5'), compact: true, popup_width: '360px',
                value: volume.anisotropy, resettable: true, reset_value: 0.18,
                min: -0.92, max: 0.92, step: 0.01, allow_lower: true
            },
            shadow_fill: {
                type: 'combo_slider', label: 'lightflow_atmosphere.field.shadow_fill', icon: 'tonality_2',
                background: 'transparent', color: markerColor(2, 'pastel', '#F1BB75'),
                icon_color: markerColor(2, 'pastel', '#F1BB75'), compact: true, popup_width: '360px',
                value: volume.shadow_fill, resettable: true, reset_value: 0.18,
                min: 0.0, max: 1.0, step: 0.001
            },
            panel_shadows: {
                type: 'action_toggle', value: volume.receive_shadows !== false, icon_size: '24px',
                description: 'lightflow_atmosphere.field.receive_shadows', icon_on: 'stroke_partial', icon_off: 'contrast_rtl_off',
                bg_on: markerColor(5, 'standard', '#4D89FF'), color_on: 'var(--color-ui)',
                color_off: markerColor(5, 'pastel', '#A6C8FF')
            },
            advanced: {
                type: 'action_button', icon: 'tune', description: 'lightflow_atmosphere.button.advanced',
                color: markerColor(4, 'pastel', '#C5A6E8'), click: openVolumeDialog
            },
            quality: {
                type: 'action_button', icon: 'speed', description: 'lightflow_atmosphere.action.settings',
                color: markerColor(6, 'pastel', '#7BFFA3'), click: openSettingsDialog
            }
        };
    }

    function syncAtmospherePanel() {
        if (!atmospherePanel?.form) return;
        syncingPanel = true;
        atmospherePanel.form.form_config = panelForm(getSelectedVolumes()[0]);
        atmospherePanel.form.buildForm();
        syncingPanel = false;
    }

    function createAtmospherePanel() {
        atmospherePanel = new Panel('lightflow_atmosphere_properties', {
            name: 'lightflow_atmosphere.panel.title',
            icon: 'blur_on',
            growable: false,
            resizable: true,
            condition: { modes: ['edit', 'render'], method: () => (Project.mode === 'render' || getSelectedVolumes().length > 0) },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [314, 240], height: 240,
                attached_to: 'transform', attached_index: 1, sidebar_index: 2
            },
            mode_positions: {
                edit: { slot: 'right_bar', height: 240, attached_to: 'transform', attached_index: 1, sidebar_index: 2 },
                render: { slot: 'left_bar', height: 260, attached_to: 'light_properties', attached_index: 1, sidebar_index: 1 }
            },
            form: panelForm(getSelectedVolumes()[0])
        });
        const atmospherePanelListener = atmospherePanel.form.on('change', ({ result, changed_keys }) => {
            if (syncingPanel) return;
            const volume = getSelectedVolumes()[0];
            if (!volume) return;
            const keys = Array.isArray(changed_keys) && changed_keys.length ? changed_keys : Object.keys(result || {});
            const mapping = {
                panel_enabled: 'enabled', panel_mode: 'density_mode', panel_density: 'density', edge_feather: 'edge_feather',
                panel_composite: 'composite_mode', panel_scattering: 'scattering_strength',
                panel_anisotropy: 'anisotropy', shadow_fill: 'shadow_fill', panel_shadows: 'receive_shadows'
            };
            const config = {};
            keys.forEach(key => {
                if (mapping[key]) config[mapping[key]] = result[key];
            });
            if (!Object.keys(config).length) return;
            Undo.initEdit({ elements: [volume] });
            applyVolumeConfig(volume, config);
            Undo.finishEdit(tr('lightflow_atmosphere.undo.edit', 'Edit Volume Domain'));
            requestPreviewRender();
        });
        window.applyIndestructibleFormGroups(atmospherePanel.form, [
            /*{
                elements: ['summary', '+', 'panel_enabled'], gap: '2px',
                divider_color: 'var(--color-grid)',
                flex: { summary: '1 1 auto', panel_enabled: '0 0 auto' }
            },*/
            { elements: ['panel_enabled', '+', '_', '+', 'panel_mode', 'panel_composite'], gap: '2px', flex: {panel_enabled: '0 0 auto', panel_mode: '0 0 auto', panel_composite: '0 0 auto' } },
            { elements: ['panel_density'], gap: '2px', flex: { panel_density: '1 1 100%' } },
            { elements: ['optics_label'], gap: '2px', flex: { optics_label: '1 1 100%' } },
            {
                elements: ['panel_scattering', 'panel_anisotropy', 'shadow_fill', '+', 'panel_shadows', 'advanced', 'quality'], gap: '2px',
                divider_color: 'var(--color-grid)',
                flex: {
                    panel_scattering: '0 0 auto', panel_anisotropy: '0 0 auto', shadow_fill: '0 0 auto',
                    panel_shadows: '0 0 auto', advanced: '0 0 auto', quality: '0 0 auto'
                }
            }
        ]);
        const panelStyles = window.LightManagerUI.addCompactPanelStyles('lightflow_atmosphere_properties');
        deletables.push(atmospherePanel, panelStyles, atmospherePanelListener);
    }

    function openSettingsDialog() {
        const settings = AtmosphereManager.settings;
        new Dialog('lightflow_atmosphere_settings_dialog', {
            title: tr('lightflow_atmosphere.settings.title', 'Atmosphere Quality'),
            form: enhanceAtmosphereDialogForm({
                _viewport: '_',
                enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: settings.enabled },
                preview_quality: { type: 'select', label: 'lightflow_atmosphere.settings.preview_quality', value: settings.preview_quality, options: QUALITY_OPTIONS },
                preview_scale: { type: 'range', label: 'lightflow_atmosphere.settings.preview_scale', value: settings.preview_scale, min: 0.25, max: 1, step: 0.05 },
                _render: '_',
                render_quality: { type: 'select', label: 'lightflow_atmosphere.settings.render_quality', value: settings.render_quality, options: QUALITY_OPTIONS },
                render_scale: { type: 'range', label: 'lightflow_atmosphere.settings.render_scale', value: settings.render_scale, min: 0.5, max: 1, step: 0.05 },
                _advanced: '_',
                temporal_jitter: { type: 'checkbox', label: 'lightflow_atmosphere.settings.jitter', value: settings.temporal_jitter },
                helper_mask: { type: 'checkbox', label: 'lightflow_atmosphere.settings.helper_mask', value: settings.helper_mask },
                static_cache: { type: 'checkbox', label: 'lightflow_atmosphere.settings.static_cache', value: settings.static_cache !== false },
                frustum_culling: { type: 'checkbox', label: 'lightflow_atmosphere.settings.frustum_culling', value: settings.frustum_culling !== false }
            }),
            onConfirm(result) {
                AtmosphereManager.settings = Object.assign({}, settings, {
                    enabled: !!result.enabled,
                    preview_quality: PREVIEW_STEPS[result.preview_quality] ? result.preview_quality : 'balanced',
                    preview_scale: clamp(finite(result.preview_scale, 0.5), 0.25, 1),
                    render_quality: RENDER_STEPS[result.render_quality] ? result.render_quality : 'high',
                    render_scale: clamp(finite(result.render_scale, 1), 0.5, 1),
                    temporal_jitter: !!result.temporal_jitter,
                    helper_mask: !!result.helper_mask,
                    static_cache: !!result.static_cache,
                    frustum_culling: !!result.frustum_culling
                });
                saveSettings(AtmosphereManager.settings);
                AtmosphereManager.invalidateSceneCache();
                requestPreviewRender();
            }
        }).show();
    }

    function installActions() {
        addVolumeAction = new Action('add_lightflow_volume', {
            name: 'lightflow_atmosphere.action.add',
            description: 'lightflow_atmosphere.action.add.desc',
            icon: 'blur_on', category: 'edit', condition: () => !!window.Project,
            click() { createVolume('soft_mist'); }
        });
        editVolumeAction = new Action('edit_lightflow_volume', {
            name: 'lightflow_atmosphere.action.edit', icon: 'tune', category: 'edit',
            condition: () => getSelectedVolumes().length > 0,
            click() { openVolumeDialog(); }
        });
        const fitAction = new Action('fit_lightflow_volume', {
            name: 'lightflow_atmosphere.action.fit', icon: 'fit_screen', category: 'edit',
            condition: () => getSelectedVolumes().length > 0 && getSelectedRenderElements().length > 0,
            click() {
                const volumes = getSelectedVolumes();
                Undo.initEdit({ elements: volumes });
                volumes.forEach(volume => fitVolumeToSelection(volume, 2));
                Undo.finishEdit(tr('lightflow_atmosphere.undo.fit', 'Fit Volume Domain'));
                syncAtmospherePanel();
                requestPreviewRender();
            }
        });
        settingsAction = new Action('lightflow_atmosphere_settings', {
            name: 'lightflow_atmosphere.action.settings', icon: 'tune', category: 'view',
            click() { openSettingsDialog(); }
        });
        [addVolumeAction, editVolumeAction, fitAction, settingsAction].forEach(action => deletables.push(action));
        BarItems.add_element.side_menu.addAction(addVolumeAction, '3');
        MenuBar.menus.edit.addAction(addVolumeAction, '9');
        MenuBar.menus.edit.addAction(editVolumeAction, '9');
        MenuBar.menus.view.addAction(settingsAction, '9');
    }

    function installTranslations() {
        Language.addTranslations('en', {
            'lightflow_atmosphere.plugin.title': 'Lightflow Atmosphere',
            'lightflow_atmosphere.action.add': 'Add Volume Domain',
            'lightflow_atmosphere.action.add.desc': 'Add a local fog, cloud, or light-shaft rendering domain',
            'lightflow_atmosphere.action.edit': 'Edit Volume Domain',
            'lightflow_atmosphere.action.fit': 'Fit Volume to Selection',
            'lightflow_atmosphere.action.settings': 'Atmosphere Quality...',
            'lightflow_atmosphere.panel.title': 'VOLUME',
            'lightflow_atmosphere.panel.none': 'Select a Volume Domain',
            'lightflow_atmosphere.dialog.edit': 'Volume Domain',
            'lightflow_atmosphere.dialog.edit_many': 'Edit Volume Domains',
            'lightflow_atmosphere.group.domain': 'Domain Setup',
            'lightflow_atmosphere.group.optics': 'Optics & Lighting',
            'lightflow_atmosphere.group.shape': 'Shape & Motion',
            'lightflow_atmosphere.group.viewport': 'Viewport',
            'lightflow_atmosphere.group.render': 'Studio Render',
            'lightflow_atmosphere.group.performance': 'Performance',
            'lightflow_atmosphere.field.preset': 'Quick Setup',
            'lightflow_atmosphere.field.enabled': 'Enabled',
            'lightflow_atmosphere.field.shape': 'Domain Shape',
            'lightflow_atmosphere.field.size': 'Domain Size',
            'lightflow_atmosphere.field.density_mode': 'Density Model',
            'lightflow_atmosphere.field.composite_mode': 'Rendering Model',
            'lightflow_atmosphere.field.density': 'Density',
            'lightflow_atmosphere.field.scattering_color': 'Scattering Color',
            'lightflow_atmosphere.field.scattering': 'Scattering',
            'lightflow_atmosphere.field.absorption_color': 'Absorption Color',
            'lightflow_atmosphere.field.absorption': 'Absorption',
            'lightflow_atmosphere.field.anisotropy': 'Anisotropy',
            'lightflow_atmosphere.field.ambient': 'Ambient Fill',
            'lightflow_atmosphere.field.receive_shadows': 'Receive Volumetric Shadows',
            'lightflow_atmosphere.field.shadow_fill': 'Multiple-Scattering Fill',
            'lightflow_atmosphere.field.bloom': 'Bloom Contribution',
            'lightflow_atmosphere.field.edge_feather': 'Boundary Feather',
            'lightflow_atmosphere.field.height_falloff': 'Height Falloff',
            'lightflow_atmosphere.field.height_offset': 'Height Base',
            'lightflow_atmosphere.field.noise_scale': 'Cloud Scale',
            'lightflow_atmosphere.field.noise_detail': 'Cloud Detail',
            'lightflow_atmosphere.field.coverage': 'Cloud Coverage',
            'lightflow_atmosphere.field.erosion': 'Cloud Softness',
            'lightflow_atmosphere.field.wind_direction': 'Wind Direction',
            'lightflow_atmosphere.field.wind_speed': 'Wind Speed',
            'lightflow_atmosphere.option.keep_values': 'Keep Current Values',
            'lightflow_atmosphere.option.box': 'Box',
            'lightflow_atmosphere.option.sphere': 'Sphere / Ellipsoid',
            'lightflow_atmosphere.option.uniform': 'Uniform Fog',
            'lightflow_atmosphere.option.height': 'Height Fog',
            'lightflow_atmosphere.option.cloud': 'Procedural Clouds',
            'lightflow_atmosphere.option.physical': 'Physical Medium (Fog / Clouds)',
            'lightflow_atmosphere.option.shafts': 'Additive Light Shafts',
            'lightflow_atmosphere.preset.soft_mist': 'Soft Mist',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Cloud Volume',
            'lightflow_atmosphere.preset.stage_haze': 'Stage Haze',
            'lightflow_atmosphere.preset.cinematic_dust': 'Cinematic Dust',
            'lightflow_atmosphere.button.advanced': 'Advanced Volume Settings...',
            'lightflow_atmosphere.settings.title': 'Atmosphere Quality',
            'lightflow_atmosphere.settings.preview_quality': 'Viewport Steps',
            'lightflow_atmosphere.settings.preview_scale': 'Viewport Resolution',
            'lightflow_atmosphere.settings.render_quality': 'Studio Render Steps',
            'lightflow_atmosphere.settings.render_scale': 'Studio Render Resolution',
            'lightflow_atmosphere.settings.jitter': 'Temporal Jitter',
            'lightflow_atmosphere.settings.helper_mask': 'Keep Gizmos and Helpers Clear',
            'lightflow_atmosphere.settings.static_cache': 'Reuse Unchanged Volume Frames',
            'lightflow_atmosphere.settings.frustum_culling': 'Cull Off-Screen Volume Domains',
            'lightflow_atmosphere.undo.add': 'Add Volume Domain',
            'lightflow_atmosphere.undo.edit': 'Edit Volume Domain',
            'lightflow_atmosphere.undo.fit': 'Fit Volume Domain',
            'lightflow_atmosphere.message.render_failed': 'Atmosphere disabled after a GPU render error',
            'lightflow_atmosphere.message.light_manager_required': 'Lightflow Atmosphere requires Light Manager.'
        });
        Language.addTranslations('es', {
            'lightflow_atmosphere.plugin.title': 'Atmósfera Lightflow',
            'lightflow_atmosphere.action.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.action.add.desc': 'Añade un área local de niebla, nubes o rayos de luz',
            'lightflow_atmosphere.action.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.action.fit': 'Ajustar volumen a la selección',
            'lightflow_atmosphere.action.settings': 'Calidad de atmósfera...',
            'lightflow_atmosphere.panel.title': 'VOLUMEN',
            'lightflow_atmosphere.panel.none': 'Selecciona un dominio volumétrico',
            'lightflow_atmosphere.dialog.edit': 'Dominio volumétrico',
            'lightflow_atmosphere.dialog.edit_many': 'Editar dominios volumétricos',
            'lightflow_atmosphere.field.preset': 'Configuración rápida',
            'lightflow_atmosphere.field.enabled': 'Activado',
            'lightflow_atmosphere.field.shape': 'Forma del dominio',
            'lightflow_atmosphere.field.size': 'Tamaño del dominio',
            'lightflow_atmosphere.field.density_mode': 'Modelo de densidad',
            'lightflow_atmosphere.field.composite_mode': 'Modelo de renderizado',
            'lightflow_atmosphere.field.density': 'Densidad',
            'lightflow_atmosphere.field.scattering_color': 'Color de dispersión',
            'lightflow_atmosphere.field.scattering': 'Dispersión',
            'lightflow_atmosphere.field.absorption_color': 'Color de absorción',
            'lightflow_atmosphere.field.absorption': 'Absorción',
            'lightflow_atmosphere.field.anisotropy': 'Anisotropía',
            'lightflow_atmosphere.field.ambient': 'Relleno ambiental',
            'lightflow_atmosphere.field.receive_shadows': 'Recibir sombras volumétricas',
            'lightflow_atmosphere.field.shadow_fill': 'Relleno de dispersión múltiple',
            'lightflow_atmosphere.field.bloom': 'Contribución al Bloom',
            'lightflow_atmosphere.field.edge_feather': 'Suavizado del límite',
            'lightflow_atmosphere.field.height_falloff': 'Caída por altura',
            'lightflow_atmosphere.field.height_offset': 'Base de altura',
            'lightflow_atmosphere.field.noise_scale': 'Escala de nubes',
            'lightflow_atmosphere.field.noise_detail': 'Detalle de nubes',
            'lightflow_atmosphere.field.coverage': 'Cobertura de nubes',
            'lightflow_atmosphere.field.erosion': 'Suavidad de nubes',
            'lightflow_atmosphere.field.wind_direction': 'Dirección del viento',
            'lightflow_atmosphere.field.wind_speed': 'Velocidad del viento',
            'lightflow_atmosphere.option.keep_values': 'Conservar valores actuales',
            'lightflow_atmosphere.option.box': 'Caja',
            'lightflow_atmosphere.option.sphere': 'Esfera / Elipsoide',
            'lightflow_atmosphere.option.uniform': 'Niebla uniforme',
            'lightflow_atmosphere.option.height': 'Niebla por altura',
            'lightflow_atmosphere.option.cloud': 'Nubes procedurales',
            'lightflow_atmosphere.option.physical': 'Medio físico (niebla / nubes)',
            'lightflow_atmosphere.option.shafts': 'Haces de luz aditivos',
            'lightflow_atmosphere.preset.soft_mist': 'Niebla suave',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Volumen de nubes',
            'lightflow_atmosphere.preset.stage_haze': 'Bruma de escenario',
            'lightflow_atmosphere.preset.cinematic_dust': 'Polvo cinematográfico',
            'lightflow_atmosphere.button.advanced': 'Ajustes avanzados del volumen...',
            'lightflow_atmosphere.settings.title': 'Calidad de atmósfera',
            'lightflow_atmosphere.settings.preview_quality': 'Pasos en el viewport',
            'lightflow_atmosphere.settings.preview_scale': 'Resolución del viewport',
            'lightflow_atmosphere.settings.render_quality': 'Pasos en Studio Render',
            'lightflow_atmosphere.settings.render_scale': 'Resolución de Studio Render',
            'lightflow_atmosphere.settings.jitter': 'Jitter temporal',
            'lightflow_atmosphere.settings.helper_mask': 'Mantener gizmos y ayudas limpios',
            'lightflow_atmosphere.settings.static_cache': 'Reutilizar frames volumétricos sin cambios',
            'lightflow_atmosphere.settings.frustum_culling': 'Omitir dominios fuera de cámara',
            'lightflow_atmosphere.undo.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.undo.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.undo.fit': 'Ajustar dominio volumétrico',
            'lightflow_atmosphere.group.domain': 'Configuración del dominio',
            'lightflow_atmosphere.group.optics': 'Óptica e iluminación',
            'lightflow_atmosphere.group.shape': 'Forma y movimiento',
            'lightflow_atmosphere.group.viewport': 'Viewport',
            'lightflow_atmosphere.group.render': 'Studio Render',
            'lightflow_atmosphere.group.performance': 'Rendimiento',
            'lightflow_atmosphere.message.render_failed': 'La atmósfera se desactivó tras un error de render de la GPU',
            'lightflow_atmosphere.message.light_manager_required': 'Lightflow Atmosphere requiere Light Manager.'
        });
    }

    function startAnimationLoop() {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        lastAnimatedFrame = 0;
        lastPreviewPatchCheck = 0;
        const tick = time => {
            if (AtmosphereManager.disposed) return;
            animationFrame = requestAnimationFrame(tick);
            if (time - lastPreviewPatchCheck >= 1000) {
                lastPreviewPatchCheck = time;
                AtmosphereManager.patchAllPreviews();
            }
            const animated = VolumeElement?.all?.some?.(volume => {
                return volume?.enabled !== false && volume?.visibility !== false && volume?.density_mode === 'cloud' && Math.abs(finite(volume.wind_speed, 0)) > 0.00001;
            });
            if (animated && !window.LightManagerStudioRenderSession && time - lastAnimatedFrame >= 33) {
                lastAnimatedFrame = time;
                requestPreviewRender();
            }
        };
        animationFrame = requestAnimationFrame(tick);
    }

    installTranslations();

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Atmosphere',
        icon: 'blur_on',
        author: 'MidFord327',
        description: 'Production-ready local fog, occluded additive light shafts, and procedural cloud domains for the Lightflow rendering suite.',
        tags: ['Lightflow', 'Rendering', 'Volumetrics'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],

        onload() {
            if (!window.LIGHT_MANAGER_LOADED || !window.LightManagerUI || typeof window.applyIndestructibleFormGroups !== 'function') {
                Blockbench.showToastNotification({
                    text: tr('lightflow_atmosphere.message.light_manager_required', 'Lightflow Atmosphere requires Light Manager.'),
                    icon: 'error',
                    expire: 10000
                });
                return;
            }
            addAtmosphereDialogStyles();
            registerVolumeElement();
            installActions();
            createAtmospherePanel();
            AtmosphereManager.init();
            publishWindowBinding('LightflowAtmosphere', AtmosphereManager);

            const studioListener = Blockbench.on('studio_render_pre_tile', event => AtmosphereManager.prepareStudioTile(event));
            const selectionListener = Blockbench.on('update_selection', () => {
                syncAtmospherePanel();

                if (atmospherePanel.isVisible() && LightflowVolumeElement.selected.length === 0) {
                    if (Project.mode === 'edit') {
                        Panels.transform.selectTab(Panels.transform);
                    }
                }

                const renderElementSelected = [window.Cube, window.Mesh, window.TextureMesh, window.LightElement].some(ElementType => (
                    ElementType && Array.isArray(ElementType.selected) && ElementType.selected.length > 0
                ));
                if (Project.mode === 'render' && LightflowVolumeElement.selected.length > 0 && !renderElementSelected) {
                    Panels.light_properties?.selectTab(atmospherePanel);
                }
            });
            const lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_atmosphere',
                ({ project, model, isCurrent, deferred }) => {
                    beginAtmosphereProject(project);
                    if (deferred) return;
                    if (!project || !isCurrent()) {
                        AtmosphereManager.invalidateSceneCache();
                        return;
                    }
                    window.LightflowLifecycle.restoreCustomElements(model, 'lightflow_volume', VolumeElement);
                    if (!isCurrent()) return;
                    AtmosphereManager.invalidateSceneCache();
                    AtmosphereManager.patchAllPreviews();
                    syncAtmospherePanel();
                    requestPreviewRender();
                }
            );
            if (lifecycleHydrator) deletables.push(lifecycleHydrator);
            else beginAtmosphereProject(window.Project || null);
            const lightManagerListener = () => {
                AtmosphereManager.invalidateSceneCache();
                AtmosphereManager.patchAllPreviews();
                requestPreviewRender();
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            const depthMutationListeners = [
                'update_transform', 'update_geometry', 'update_faces', 'update_uv'
            ].map(eventName => Blockbench.on(eventName, () => AtmosphereManager.invalidateDepthCache()));
            const sceneMutationListeners = [
                'add_cube', 'add_mesh', 'add_texture_mesh', 'remove_cube', 'remove_mesh',
                'undo', 'redo'
            ].map(eventName => Blockbench.on(eventName, () => AtmosphereManager.invalidateSceneCache()));
            deletables.push(studioListener, selectionListener, ...depthMutationListeners, ...sceneMutationListeners, {
                delete() { window.removeEventListener('light_manager_initialized', lightManagerListener); }
            });
            syncAtmospherePanel();
            startAnimationLoop();
            requestPreviewRender();
        },

        onunload() {
            beginAtmosphereProject(null);
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            AtmosphereManager.dispose();
            disposeRegisteredResources();
            if (VolumeElement?.all) {
                VolumeElement.all.forEach(volume => {
                    const mesh = volume?.mesh;
                    mesh?.boxGizmo?.geometry?.dispose?.();
                    mesh?.sphereGizmo?.geometry?.dispose?.();
                    mesh?.boxGizmo?.material?.dispose?.();
                    mesh?.sphereGizmo?.material?.dispose?.();
                    mesh?.boxSelection?.geometry?.dispose?.();
                    mesh?.sphereSelection?.geometry?.dispose?.();
                    mesh?.boxSelection?.material?.dispose?.();
                    mesh?.sphereSelection?.material?.dispose?.();
                    mesh?.geometry?.dispose?.();
                    mesh?.parent?.remove?.(mesh);
                    if (window.Project?.nodes_3d?.[volume.uuid] === mesh) {
                        delete Project.nodes_3d[volume.uuid];
                    }
                });
            }
            if (OutlinerElement.types.lightflow_volume === VolumeElement) {
                delete OutlinerElement.types.lightflow_volume;
            }
            if (NodePreviewController.controllers?.lightflow_volume === volumePreviewController) {
                volumePreviewController.delete();
            }
            restoreWindowBindings();
            VolumeElement = null;
            volumePreviewController = null;
            atmospherePanel = null;
            addVolumeAction = null;
            editVolumeAction = null;
            settingsAction = null;
        }
    });
})();
