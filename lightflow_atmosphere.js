(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_atmosphere';
    const PLUGIN_VERSION = '0.1.1';
    const MAX_VOLUMES = 4;
    const MAX_LIGHTS = 4;
    const MAX_SHADOWS = 2;
    const MAX_RAY_STEPS = 96;
    const STORAGE_KEY = 'lightflow_atmosphere.settings';
    const DEFAULT_SETTINGS = {
        enabled: true,
        temporal_jitter: false,
        helper_mask: true,
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
            density_mode: 'height', density: 0.032, scattering_strength: 0.82,
            absorption: 0.16, anisotropy: 0.18, height_falloff: 1.35,
            height_offset: 0.12, edge_feather: 0.14, ambient: 0.22,
            scattering_color: [214, 229, 242], absorption_color: [226, 235, 242]
        },
        godrays: {
            density_mode: 'uniform', density: 0.06, scattering_strength: 1.4,
            absorption: 0.025, anisotropy: 0.68, edge_feather: 0.32,
            ambient: 0.008, receive_shadows: true,
            scattering_color: [255, 238, 205], absorption_color: [255, 248, 232]
        },
        clouds: {
            density_mode: 'cloud', density: 0.095, scattering_strength: 1.0,
            absorption: 0.34, anisotropy: 0.42, edge_feather: 0.18,
            noise_scale: 3.6, noise_detail: 4, coverage: 0.46, erosion: 0.24,
            height_falloff: 0.65, height_offset: 0.18, ambient: 0.16,
            scattering_color: [244, 247, 255], absorption_color: [212, 224, 240]
        },
        stage_haze: {
            density_mode: 'uniform', density: 0.018, scattering_strength: 0.72,
            absorption: 0.08, anisotropy: 0.58, edge_feather: 0.2,
            ambient: 0.04, scattering_color: [232, 238, 255],
            absorption_color: [242, 246, 255]
        }
    };

    let VolumeElement = null;
    let atmospherePanel = null;
    let addVolumeAction = null;
    let editVolumeAction = null;
    let settingsAction = null;
    let stylesheet = null;
    let animationFrame = null;
    let lastAnimatedFrame = 0;
    let lastPreviewPatchCheck = 0;
    let syncingPanel = false;
    const deletables = [];

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
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            // Local storage is optional; project volumes remain fully usable.
        }
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
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
        const preview = window.Preview && Preview.selected;
        if (preview && typeof preview.render === 'function') preview.render();
        else if (window.Canvas && typeof Canvas.updateView === 'function') Canvas.updateView({ elements: [], element_aspects: {} });
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
            if (slot == 0) return shadowCompare0(worldPoint);
            if (slot == 1) return shadowCompare1(worldPoint);
            return 1.0;
        }

        vec3 volumeLighting(int volumeIndex, vec3 worldPoint, vec3 viewDirection) {
            vec3 lighting = uAmbientColor * uVolumeFlags[volumeIndex].y;
            float anisotropy = uVolumeOptics[volumeIndex].w;
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
                    vec3 lightEnergy = volumeLighting(volumeIndex, worldPoint, rayDirection);
                    scatteringSource += sigmaS * lightEnergy * (uBloomPass ? bloomContribution : 1.0);
                    extinctionColor += sigmaS + sigmaA;
                }
                float extinction = dot(extinctionColor, vec3(0.2126, 0.7152, 0.0722));
                if (extinction > 0.000001) {
                    float stepTransmission = exp(-extinction * stepLength);
                    vec3 integratedScatter = scatteringSource * ((1.0 - stepTransmission) / extinction);
                    accumulated += transmittance * integratedScatter;
                    transmittance *= stepTransmission;
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
        disposed: false,

        init() {
            this.disposed = false;
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

        getActiveVolumes(camera) {
            if (!VolumeElement || !Array.isArray(VolumeElement.all)) return [];
            const cameraPosition = new THREE.Vector3();
            camera?.getWorldPosition?.(cameraPosition);
            return VolumeElement.all.filter(volume => {
                return volume && volume.visibility !== false && volume.enabled !== false && volume.mesh && finite(volume.density, 0) > 0;
            }).sort((first, second) => {
                const firstPosition = first.mesh?.getWorldPosition ? first.mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
                const secondPosition = second.mesh?.getWorldPosition ? second.mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
                const firstScore = finite(first.density, 0) * 256 - firstPosition.distanceToSquared(cameraPosition) * 0.0001;
                const secondScore = finite(second.density, 0) * 256 - secondPosition.distanceToSquared(cameraPosition) * 0.0001;
                return secondScore - firstScore;
            }).slice(0, MAX_VOLUMES);
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
                lastBloomMultiplier: 1
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
                state.volumeUniforms.uResolution.value.set(volumeWidth, volumeHeight);
                state.compositeUniforms.uVolumeTexel.value.set(1 / volumeWidth, 1 / volumeHeight);
                state.lastNormalVolumeReady = false;
            }
            if (state.depthWidth !== volumeWidth || state.depthHeight !== volumeHeight) {
                state.depthWidth = volumeWidth;
                state.depthHeight = volumeHeight;
                state.sceneTarget.setSize(volumeWidth, volumeHeight);
                state.cubeTarget.setSize(volumeWidth, volumeHeight);
            }
            state.compositeUniforms.uBilateralUpsample.value = volumeWidth < sceneWidth || volumeHeight < sceneHeight;
        },

        findFreshSharedSceneDepth(preview, state) {
            if (this.settings.helper_mask) return null;
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

            const cubeObjects = this.collectCubeObjects();
            if (this.settings.helper_mask && this.hasVisibleHelpers(window.Canvas?.scene, cubeObjects)) return null;
            const allVisibleCubesCovered = (window.Cube?.all || []).every(cube => {
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

        collectCubeObjects() {
            const cubeObjects = new WeakSet();
            (window.Cube?.all || []).forEach(cube => {
                const mesh = getCubeMesh(cube);
                if (!mesh) return;
                if (mesh.isMesh) cubeObjects.add(mesh);
                mesh.traverse?.(object => {
                    if (object?.isMesh && object.material) cubeObjects.add(object);
                });
            });
            return cubeObjects;
        },

        collectNonCubeVisibilityChanges(cubeObjects) {
            const knownCubeObjects = cubeObjects || this.collectCubeObjects();
            const changes = [];
            const scene = window.Canvas?.scene;
            scene?.traverse?.(object => {
                const renderable = object?.isMesh || object?.isSprite || object?.isLine || object?.isLineSegments || object?.isPoints;
                if (renderable && object.visible && !knownCubeObjects.has(object)) {
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
            scene?.traverse?.(object => {
                if (found || !object?.visible || cubeObjects.has(object)) return;
                let ancestor = object.parent;
                while (ancestor && ancestor !== scene) {
                    if (ancestor.visible === false) return;
                    ancestor = ancestor.parent;
                }
                if (object.isLine || object.isLineSegments || object.isSprite || object.isPoints) found = true;
            });
            return found;
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
                    renderer.setViewport?.(0, 0, state.depthWidth, state.depthHeight);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    try {
                        renderer.render(scene, camera);
                    } finally {
                        this.restoreMaterialChanges(helperDepthChanges);
                    }
                }
                const hidden = this.collectNonCubeVisibilityChanges(cubeObjects);
                const cubeDepthChanges = this.forceDepthWriting(scene, object => cubeObjects.has(object));
                renderer.setRenderTarget(state.cubeTarget);
                renderer.setViewport?.(0, 0, state.depthWidth, state.depthHeight);
                renderer.setClearColor?.(0x000000, 0);
                renderer.clear?.(true, true, true);
                try {
                    renderer.render(scene, camera);
                } finally {
                    this.restoreMaterialChanges(cubeDepthChanges);
                    hidden.forEach(object => { object.visible = true; });
                }
                state.ownDepthStamp = performance.now();
                return {
                    sceneDepth: needsHelperDepth ? (sharedSceneDepth || state.sceneTarget.depthTexture) : state.cubeTarget.depthTexture,
                    cubeDepth: state.cubeTarget.depthTexture
                };
            } finally {
                renderer.setRenderTarget?.(previousTarget);
                if (previousViewport) renderer.setViewport?.(previousViewport);
                if (previousScissor) renderer.setScissor?.(previousScissor);
                renderer.setScissorTest?.(previousScissorTest);
                renderer.autoClear = previousAutoClear;
                renderer.setClearColor?.(clearColor, clearAlpha);
                if (renderer.shadowMap && previousShadowAutoUpdate !== undefined) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
            }
        },

        updateVolumeUniforms(state, volumes) {
            const uniforms = state.volumeUniforms;
            const scaleMatrix = new THREE.Matrix4();
            const worldMatrix = new THREE.Matrix4();
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
                    0
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
                    0
                );
                colorArrayToVector(volume.scattering_color, uniforms.uVolumeColor.value[index]);
                colorArrayToVector(volume.absorption_color, uniforms.uVolumeAbsorptionColor.value[index]);
            }
            uniforms.uVolumeCount.value = volumes.length;
        },

        updateLightUniforms(state) {
            const uniforms = state.volumeUniforms;
            const entries = Object.entries(window.three_lights || {}).filter(([, light]) => {
                return light && light.visible !== false && finite(light.intensity, 0) > 0;
            }).sort((first, second) => finite(second[1]?.intensity, 0) - finite(first[1]?.intensity, 0)).slice(0, MAX_LIGHTS);
            const position = new THREE.Vector3();
            const targetPosition = new THREE.Vector3();
            const direction = new THREE.Vector3();
            let shadowCount = 0;
            for (let index = 0; index < MAX_LIGHTS; index++) {
                const entry = entries[index];
                if (!entry) {
                    uniforms.uLightPositionType.value[index].set(0, 0, 0, 1);
                    uniforms.uLightDirectionRange.value[index].set(0, -1, 0, 0);
                    uniforms.uLightColorIntensity.value[index].set(0, 0, 0, 0);
                    uniforms.uLightConeShadow.value[index].set(-1, 1, -1, 0);
                    continue;
                }
                const [uuid, light] = entry;
                const element = window.LightElement?.all?.find?.(candidate => candidate?.uuid === uuid);
                light.getWorldPosition?.(position);
                if (light.target?.getWorldPosition) {
                    light.target.getWorldPosition(targetPosition);
                    direction.copy(targetPosition).sub(position).normalize();
                } else {
                    direction.set(0, 0, -1).applyQuaternion(light.getWorldQuaternion(new THREE.Quaternion())).normalize();
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
            uniforms.uLightCount.value = entries.length;
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
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
            const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
            const previousScissorTest = renderer.getScissorTest?.() ?? false;
            const previousClearColor = new THREE.Color();
            const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
            renderer.getClearColor?.(previousClearColor);
            try {
                const useCachedBloom = !!settings.bloomMask && state.lastNormalVolumeReady && state.lastNormalStudio === studio;
                if (!useCachedBloom) {
                    // AO runs immediately before Atmosphere in the Lightflow
                    // pipeline. Reuse its fresh depth buffers when they cover
                    // every visible cube; this removes two full scene draws
                    // per tile while preserving alpha-tested foliage depth.
                    const depthSources = this.findFreshSharedDepthSources(preview, state) || this.captureDepth(state, preview);
                    if (!depthSources) return false;
                    this.updateUniforms(state, preview, volumes, studio, !!settings.bloomMask, depthSources);
                    renderer.autoClear = true;
                    renderer.setScissorTest?.(false);
                    renderer.setRenderTarget?.(state.volumeTarget);
                    renderer.setViewport?.(0, 0, state.volumeWidth, state.volumeHeight);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    renderer.render(state.volumeScene, state.postCamera);
                    if (!settings.bloomMask) {
                        state.lastNormalVolumeReady = true;
                        state.lastNormalStudio = studio;
                        state.lastBloomMultiplier = volumes.reduce((maximum, volume) => {
                            return Math.max(maximum, clamp(finite(volume.bloom_contribution, 1), 0, 4));
                        }, 0);
                    }
                }

                renderer.autoClear = false;
                renderer.setRenderTarget?.(previousTarget);
                /*
                 * getDrawingBufferSize() is expressed in physical pixels,
                 * while setViewport() on the default framebuffer expects
                 * logical pixels and applies renderer.pixelRatio itself.
                 * Reusing the saved viewport prevents a second DPI scaling,
                 * which was the source of the Windows viewport offset.
                 */
                if (previousViewport) renderer.setViewport?.(previousViewport);
                else if (previousTarget) renderer.setViewport?.(0, 0, previousTarget.width, previousTarget.height);
                renderer.setScissorTest?.(false);
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
                renderer.setRenderTarget?.(previousTarget);
                if (previousViewport) renderer.setViewport?.(previousViewport);
                if (previousScissor) renderer.setScissor?.(previousScissor);
                renderer.setScissorTest?.(previousScissorTest);
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
                sanitizeVolume(this);
            }

            get origin() { return this.position; }

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
                hide_in_screenshot: true
            };
        }

        VolumeElement = LightflowVolumeElement;
        window.LightflowVolumeElement = VolumeElement;
        VolumeElement.prototype.title = 'Volume Domain';
        VolumeElement.prototype.type = 'lightflow_volume';
        VolumeElement.prototype.icon = 'blur_on';
        VolumeElement.prototype.movable = true;
        VolumeElement.prototype.rotatable = true;
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

        new Property(VolumeElement, 'string', 'name', { default: 'Volume Domain' });
        new Property(VolumeElement, 'string', 'shape', { default: 'box' });
        new Property(VolumeElement, 'string', 'density_mode', { default: 'uniform' });
        new Property(VolumeElement, 'vector', 'position');
        new Property(VolumeElement, 'vector', 'rotation');
        new Property(VolumeElement, 'vector', 'size', { default: [32, 16, 32] });
        new Property(VolumeElement, 'boolean', 'visibility', { default: true });
        new Property(VolumeElement, 'boolean', 'enabled', { default: true });
        new Property(VolumeElement, 'number', 'density', { default: 0.04, min: 0 });
        new Property(VolumeElement, 'vector', 'scattering_color', { default: [232, 240, 255] });
        new Property(VolumeElement, 'number', 'scattering_strength', { default: 0.9, min: 0 });
        new Property(VolumeElement, 'vector', 'absorption_color', { default: [235, 242, 255] });
        new Property(VolumeElement, 'number', 'absorption', { default: 0.18, min: 0 });
        new Property(VolumeElement, 'number', 'anisotropy', { default: 0.35 });
        new Property(VolumeElement, 'number', 'ambient', { default: 0.12, min: 0 });
        new Property(VolumeElement, 'boolean', 'receive_shadows', { default: true });
        new Property(VolumeElement, 'number', 'bloom_contribution', { default: 1, min: 0 });
        new Property(VolumeElement, 'number', 'edge_feather', { default: 0.12, min: 0 });
        new Property(VolumeElement, 'number', 'height_falloff', { default: 1.2, min: 0 });
        new Property(VolumeElement, 'number', 'height_offset', { default: 0.1, min: 0 });
        new Property(VolumeElement, 'number', 'noise_scale', { default: 3.2, min: 0.01 });
        new Property(VolumeElement, 'number', 'noise_detail', { default: 3, min: 1 });
        new Property(VolumeElement, 'number', 'coverage', { default: 0.45, min: 0 });
        new Property(VolumeElement, 'number', 'erosion', { default: 0.22, min: 0.01 });
        new Property(VolumeElement, 'vector', 'wind_direction', { default: [1, 0, 0] });
        new Property(VolumeElement, 'number', 'wind_speed', { default: 0 });

        OutlinerElement.registerType(VolumeElement, 'lightflow_volume');

        new NodePreviewController(VolumeElement, {
            setup(element) {
                const mesh = new THREE.Object3D();
                Project.nodes_3d[element.uuid] = mesh;
                mesh.name = element.uuid;
                mesh.type = element.type;
                mesh.isElement = true;
                mesh.rotation.order = window.Format?.euler_order || 'ZYX';

                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x67d7e8,
                    transparent: true,
                    opacity: 0.42,
                    depthTest: true,
                    depthWrite: false
                });
                const boxGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
                const sphereGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.5, 16, 10));
                mesh.boxGizmo = new THREE.LineSegments(boxGeometry, lineMaterial.clone());
                mesh.sphereGizmo = new THREE.LineSegments(sphereGeometry, lineMaterial.clone());
                mesh.boxGizmo.raycast = () => {};
                mesh.sphereGizmo.raycast = () => {};
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
        const selected = window.Cube?.selected || [];
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
        Object.keys(config).forEach(key => {
            if (VolumeElement.properties[key]) volume[key] = Array.isArray(config[key]) ? config[key].slice() : config[key];
        });
        sanitizeVolume(volume);
        VolumeElement.preview_controller?.updateTransform(volume);
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

    function volumeDialogForm(volume) {
        return {
            preset: {
                type: 'select',
                label: 'lightflow_atmosphere.field.preset',
                value: 'custom',
                options: {
                    custom: 'lightflow_atmosphere.option.keep_values',
                    soft_mist: 'lightflow_atmosphere.preset.soft_mist',
                    godrays: 'lightflow_atmosphere.preset.godrays',
                    clouds: 'lightflow_atmosphere.preset.clouds',
                    stage_haze: 'lightflow_atmosphere.preset.stage_haze'
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
            _optics: '_',
            density: { type: 'number', label: 'lightflow_atmosphere.field.density', value: volume.density, min: 0, max: 4, step: 0.001 },
            scattering_color: { type: 'color', label: 'lightflow_atmosphere.field.scattering_color', value: colorArrayToHex(volume.scattering_color) },
            scattering_strength: { type: 'number', label: 'lightflow_atmosphere.field.scattering', value: volume.scattering_strength, min: 0, max: 8, step: 0.01 },
            absorption_color: { type: 'color', label: 'lightflow_atmosphere.field.absorption_color', value: colorArrayToHex(volume.absorption_color) },
            absorption: { type: 'number', label: 'lightflow_atmosphere.field.absorption', value: volume.absorption, min: 0, max: 8, step: 0.01 },
            anisotropy: { type: 'range', label: 'lightflow_atmosphere.field.anisotropy', value: volume.anisotropy, min: -0.92, max: 0.92, step: 0.01 },
            ambient: { type: 'range', label: 'lightflow_atmosphere.field.ambient', value: volume.ambient, min: 0, max: 2, step: 0.01 },
            receive_shadows: { type: 'checkbox', label: 'lightflow_atmosphere.field.receive_shadows', value: volume.receive_shadows !== false },
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
        };
    }

    function normalizeDialogResult(result, volume) {
        return {
            name: String(result.name || volume.name || 'Volume Domain'),
            enabled: !!result.enabled,
            shape: result.shape === 'sphere' ? 'sphere' : 'box',
            size: Array.isArray(result.size) ? result.size.slice(0, 3) : volume.size,
            density_mode: ['uniform', 'height', 'cloud'].includes(result.density_mode) ? result.density_mode : 'uniform',
            density: finite(result.density, volume.density),
            scattering_color: hexToColorArray(result.scattering_color, volume.scattering_color),
            scattering_strength: finite(result.scattering_strength, volume.scattering_strength),
            absorption_color: hexToColorArray(result.absorption_color, volume.absorption_color),
            absorption: finite(result.absorption, volume.absorption),
            anisotropy: finite(result.anisotropy, volume.anisotropy),
            ambient: finite(result.ambient, volume.ambient),
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
            panel_enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: volume.enabled !== false },
            panel_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.density_mode', value: volume.density_mode,
                options: { uniform: 'lightflow_atmosphere.option.uniform', height: 'lightflow_atmosphere.option.height', cloud: 'lightflow_atmosphere.option.cloud' }
            },
            panel_density: { type: 'range', label: 'lightflow_atmosphere.field.density', value: volume.density, min: 0, max: 0.3, step: 0.001 },
            panel_scattering: { type: 'range', label: 'lightflow_atmosphere.field.scattering', value: volume.scattering_strength, min: 0, max: 4, step: 0.01 },
            panel_anisotropy: { type: 'range', label: 'lightflow_atmosphere.field.anisotropy', value: volume.anisotropy, min: -0.92, max: 0.92, step: 0.01 },
            panel_shadows: { type: 'checkbox', label: 'lightflow_atmosphere.field.receive_shadows', value: volume.receive_shadows !== false },
            advanced: {
                type: 'buttons', buttons: ['lightflow_atmosphere.button.advanced'],
                click() { openVolumeDialog(); }
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
            growable: true,
            resizable: true,
            condition: { modes: ['edit', 'render'], method: () => getSelectedVolumes().length > 0 },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [320, 430], height: 430,
                attached_to: 'transform', attached_index: 1, sidebar_index: 2
            },
            mode_positions: {
                edit: { slot: 'right_bar', height: 430, attached_to: 'transform', attached_index: 1, sidebar_index: 2 },
                render: { slot: 'left_bar', height: 430, attached_to: 'material_properties', attached_index: 2, sidebar_index: 2 }
            },
            form: panelForm(getSelectedVolumes()[0])
        });
        atmospherePanel.form.on('change', ({ result, changed_keys }) => {
            if (syncingPanel) return;
            const volume = getSelectedVolumes()[0];
            if (!volume) return;
            const keys = Array.isArray(changed_keys) && changed_keys.length ? changed_keys : Object.keys(result || {});
            const mapping = {
                panel_enabled: 'enabled', panel_mode: 'density_mode', panel_density: 'density',
                panel_scattering: 'scattering_strength', panel_anisotropy: 'anisotropy', panel_shadows: 'receive_shadows'
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
        deletables.push(atmospherePanel);
    }

    function openSettingsDialog() {
        const settings = AtmosphereManager.settings;
        new Dialog('lightflow_atmosphere_settings_dialog', {
            title: tr('lightflow_atmosphere.settings.title', 'Atmosphere Quality'),
            form: {
                enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: settings.enabled },
                preview_quality: { type: 'select', label: 'lightflow_atmosphere.settings.preview_quality', value: settings.preview_quality, options: QUALITY_OPTIONS },
                preview_scale: { type: 'range', label: 'lightflow_atmosphere.settings.preview_scale', value: settings.preview_scale, min: 0.25, max: 1, step: 0.05 },
                _render: '_',
                render_quality: { type: 'select', label: 'lightflow_atmosphere.settings.render_quality', value: settings.render_quality, options: QUALITY_OPTIONS },
                render_scale: { type: 'range', label: 'lightflow_atmosphere.settings.render_scale', value: settings.render_scale, min: 0.5, max: 1, step: 0.05 },
                _advanced: '_',
                temporal_jitter: { type: 'checkbox', label: 'lightflow_atmosphere.settings.jitter', value: settings.temporal_jitter },
                helper_mask: { type: 'checkbox', label: 'lightflow_atmosphere.settings.helper_mask', value: settings.helper_mask }
            },
            onConfirm(result) {
                AtmosphereManager.settings = Object.assign({}, settings, {
                    enabled: !!result.enabled,
                    preview_quality: PREVIEW_STEPS[result.preview_quality] ? result.preview_quality : 'balanced',
                    preview_scale: clamp(finite(result.preview_scale, 0.5), 0.25, 1),
                    render_quality: RENDER_STEPS[result.render_quality] ? result.render_quality : 'high',
                    render_scale: clamp(finite(result.render_scale, 1), 0.5, 1),
                    temporal_jitter: !!result.temporal_jitter,
                    helper_mask: !!result.helper_mask
                });
                saveSettings(AtmosphereManager.settings);
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
            condition: () => getSelectedVolumes().length > 0 && (window.Cube?.selected?.length || 0) > 0,
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
        Interface.Panels.outliner.menu.addAction(addVolumeAction, '3');
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
            'lightflow_atmosphere.panel.title': 'ATMOSPHERE',
            'lightflow_atmosphere.panel.none': 'Select a Volume Domain',
            'lightflow_atmosphere.dialog.edit': 'Volume Domain',
            'lightflow_atmosphere.dialog.edit_many': 'Edit Volume Domains',
            'lightflow_atmosphere.field.preset': 'Quick Setup',
            'lightflow_atmosphere.field.enabled': 'Enabled',
            'lightflow_atmosphere.field.shape': 'Domain Shape',
            'lightflow_atmosphere.field.size': 'Domain Size',
            'lightflow_atmosphere.field.density_mode': 'Density Model',
            'lightflow_atmosphere.field.density': 'Density',
            'lightflow_atmosphere.field.scattering_color': 'Scattering Color',
            'lightflow_atmosphere.field.scattering': 'Scattering',
            'lightflow_atmosphere.field.absorption_color': 'Absorption Color',
            'lightflow_atmosphere.field.absorption': 'Absorption',
            'lightflow_atmosphere.field.anisotropy': 'Anisotropy',
            'lightflow_atmosphere.field.ambient': 'Ambient Fill',
            'lightflow_atmosphere.field.receive_shadows': 'Receive Volumetric Shadows',
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
            'lightflow_atmosphere.preset.soft_mist': 'Soft Mist',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Cloud Volume',
            'lightflow_atmosphere.preset.stage_haze': 'Stage Haze',
            'lightflow_atmosphere.button.advanced': 'Advanced Volume Settings...',
            'lightflow_atmosphere.settings.title': 'Atmosphere Quality',
            'lightflow_atmosphere.settings.preview_quality': 'Viewport Steps',
            'lightflow_atmosphere.settings.preview_scale': 'Viewport Resolution',
            'lightflow_atmosphere.settings.render_quality': 'Studio Render Steps',
            'lightflow_atmosphere.settings.render_scale': 'Studio Render Resolution',
            'lightflow_atmosphere.settings.jitter': 'Temporal Jitter',
            'lightflow_atmosphere.settings.helper_mask': 'Keep Gizmos and Helpers Clear',
            'lightflow_atmosphere.undo.add': 'Add Volume Domain',
            'lightflow_atmosphere.undo.edit': 'Edit Volume Domain',
            'lightflow_atmosphere.undo.fit': 'Fit Volume Domain',
            'lightflow_atmosphere.message.render_failed': 'Atmosphere disabled after a GPU render error'
        });
        Language.addTranslations('es', {
            'lightflow_atmosphere.plugin.title': 'Atmósfera Lightflow',
            'lightflow_atmosphere.action.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.action.add.desc': 'Añade un área local de niebla, nubes o rayos de luz',
            'lightflow_atmosphere.action.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.action.fit': 'Ajustar volumen a la selección',
            'lightflow_atmosphere.action.settings': 'Calidad de atmósfera...',
            'lightflow_atmosphere.panel.title': 'ATMÓSFERA',
            'lightflow_atmosphere.panel.none': 'Selecciona un dominio volumétrico',
            'lightflow_atmosphere.dialog.edit': 'Dominio volumétrico',
            'lightflow_atmosphere.dialog.edit_many': 'Editar dominios volumétricos',
            'lightflow_atmosphere.field.preset': 'Configuración rápida',
            'lightflow_atmosphere.field.enabled': 'Activado',
            'lightflow_atmosphere.field.shape': 'Forma del dominio',
            'lightflow_atmosphere.field.size': 'Tamaño del dominio',
            'lightflow_atmosphere.field.density_mode': 'Modelo de densidad',
            'lightflow_atmosphere.field.density': 'Densidad',
            'lightflow_atmosphere.field.scattering_color': 'Color de dispersión',
            'lightflow_atmosphere.field.scattering': 'Dispersión',
            'lightflow_atmosphere.field.absorption_color': 'Color de absorción',
            'lightflow_atmosphere.field.absorption': 'Absorción',
            'lightflow_atmosphere.field.anisotropy': 'Anisotropía',
            'lightflow_atmosphere.field.ambient': 'Relleno ambiental',
            'lightflow_atmosphere.field.receive_shadows': 'Recibir sombras volumétricas',
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
            'lightflow_atmosphere.preset.soft_mist': 'Niebla suave',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Volumen de nubes',
            'lightflow_atmosphere.preset.stage_haze': 'Bruma de escenario',
            'lightflow_atmosphere.button.advanced': 'Ajustes avanzados del volumen...',
            'lightflow_atmosphere.settings.title': 'Calidad de atmósfera',
            'lightflow_atmosphere.settings.preview_quality': 'Pasos en el viewport',
            'lightflow_atmosphere.settings.preview_scale': 'Resolución del viewport',
            'lightflow_atmosphere.settings.render_quality': 'Pasos en Studio Render',
            'lightflow_atmosphere.settings.render_scale': 'Resolución de Studio Render',
            'lightflow_atmosphere.settings.jitter': 'Jitter temporal',
            'lightflow_atmosphere.settings.helper_mask': 'Mantener gizmos y ayudas limpios',
            'lightflow_atmosphere.undo.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.undo.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.undo.fit': 'Ajustar dominio volumétrico',
            'lightflow_atmosphere.message.render_failed': 'La atmósfera se desactivó tras un error de render de la GPU'
        });
    }

    function startAnimationLoop() {
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
        description: 'Physically grounded local fog, volumetric light shafts, and procedural cloud domains for the Lightflow rendering suite.',
        tags: ['Lightflow', 'Rendering', 'Volumetrics', 'Fog', 'God Rays', 'Clouds'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',

        onload() {
            registerVolumeElement();
            installActions();
            createAtmospherePanel();
            AtmosphereManager.init();
            window.LightflowAtmosphere = AtmosphereManager;

            const studioListener = Blockbench.on('studio_render_pre_tile', event => AtmosphereManager.prepareStudioTile(event));
            const selectionListener = Blockbench.on('update_selection', () => syncAtmospherePanel());
            const projectListener = Blockbench.on('select_project', () => {
                AtmosphereManager.patchAllPreviews();
                syncAtmospherePanel();
                requestPreviewRender();
            });
            const lightManagerListener = () => {
                AtmosphereManager.patchAllPreviews();
                requestPreviewRender();
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(studioListener, selectionListener, projectListener, {
                delete() { window.removeEventListener('light_manager_initialized', lightManagerListener); }
            });
            syncAtmospherePanel();
            startAnimationLoop();
            requestPreviewRender();
        },

        onunload() {
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            AtmosphereManager.dispose();
            deletables.splice(0).reverse().forEach(item => item?.delete?.());
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
                });
            }
            delete OutlinerElement.types.lightflow_volume;
            if (NodePreviewController.controllers?.lightflow_volume) NodePreviewController.controllers.lightflow_volume.delete();
            delete window.LightflowAtmosphere;
            delete window.LightflowVolumeElement;
            VolumeElement = null;
            atmospherePanel = null;
            addVolumeAction = null;
            editVolumeAction = null;
            settingsAction = null;
            stylesheet?.remove?.();
            stylesheet = null;
        }
    });
})();
