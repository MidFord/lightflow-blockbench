(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.0.0';
    const STORAGE_KEY = 'lightflow_environment.settings';
    const PROJECT_PROPERTY = 'lightflow_environment_settings';
    const TWO_PI = Math.PI * 2;

    const DEFAULT_SETTINGS = {
        enabled: true,
        preset: 'vanilla',
        time: 6000,
        animate_time: false,
        day_length_seconds: 120,
        sun_azimuth: 0,
        sky_intensity: 1,
        environment_strength: 0.75,
        sun_enabled: true,
        sun_intensity: 2.2,
        moon_intensity: 0.28,
        celestial_size: 0.055,
        moon_phase: 0,
        stars_enabled: true,
        star_brightness: 0.72,
        clouds_enabled: true,
        cloud_coverage: 0.54,
        cloud_opacity: 0.78,
        cloud_speed: 0.016,
        sun_cast_shadows: true,
        shadow_area: 48,
        shadow_near: 0.1,
        shadow_far: 480,
        shadow_resolution: 2048,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.025,
        pixelated_shadows: false,
        pixel_shadow_steps: 4,
        pixel_shadow_scale: 2
    };

    const PRESETS = {
        vanilla: {
            name: 'Minecraft Vanilla',
            zenith: '#78a7ff', horizon: '#b8d2ff',
            sunrise_zenith: '#647db5', sunrise_horizon: '#f59a62',
            night_zenith: '#05091d', night_horizon: '#151d3d',
            ground: '#536b78', sun: '#fff3c4', moon: '#dbe4ff', cloud: '#f3f5f7',
            ambient_day: 0.78, ambient_night: 0.17
        },
        vibrant_visuals: {
            name: 'Minecraft Vibrant Visuals',
            zenith: '#3184ff', horizon: '#a6dcff',
            sunrise_zenith: '#6b69bd', sunrise_horizon: '#ff874d',
            night_zenith: '#030824', night_horizon: '#1f2b5b',
            ground: '#416579', sun: '#fff1b0', moon: '#cbdcff', cloud: '#fff7ec',
            ambient_day: 0.92, ambient_night: 0.21
        }
    };

    let settings = loadSettings();
    let skyMesh = null;
    let skyMaterial = null;
    let sunLight = null;
    let sunTarget = null;
    let settingsAction = null;
    let timeSlider = null;
    let animateToggle = null;
    let projectProperty = null;
    let animationFrame = null;
    let lastFrameTime = 0;
    let lastRenderTime = 0;
    const deletables = [];

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value)));
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function mod(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
    }

    function normalizeSettings(source) {
        const result = Object.assign({}, DEFAULT_SETTINGS, source || {});
        result.enabled = result.enabled !== false;
        result.preset = PRESETS[result.preset] ? result.preset : 'vanilla';
        result.time = mod(finite(result.time, 6000), 24000);
        result.animate_time = !!result.animate_time;
        result.day_length_seconds = clamp(finite(result.day_length_seconds, 120), 10, 3600);
        result.sun_azimuth = mod(finite(result.sun_azimuth, 0), 360);
        result.sky_intensity = clamp(finite(result.sky_intensity, 1), 0, 4);
        result.environment_strength = clamp(finite(result.environment_strength, 0.75), 0, 4);
        result.sun_enabled = result.sun_enabled !== false;
        result.sun_intensity = clamp(finite(result.sun_intensity, 2.2), 0, 20);
        result.moon_intensity = clamp(finite(result.moon_intensity, 0.28), 0, 5);
        result.celestial_size = clamp(finite(result.celestial_size, 0.055), 0.012, 0.18);
        result.moon_phase = Math.round(clamp(finite(result.moon_phase, 0), 0, 7));
        result.stars_enabled = result.stars_enabled !== false;
        result.star_brightness = clamp(finite(result.star_brightness, 0.72), 0, 3);
        result.clouds_enabled = result.clouds_enabled !== false;
        result.cloud_coverage = clamp(finite(result.cloud_coverage, 0.54), 0, 1);
        result.cloud_opacity = clamp(finite(result.cloud_opacity, 0.78), 0, 1);
        result.cloud_speed = clamp(finite(result.cloud_speed, 0.016), -1, 1);
        result.sun_cast_shadows = result.sun_cast_shadows !== false;
        result.shadow_area = clamp(finite(result.shadow_area, 48), 2, 1024);
        result.shadow_near = clamp(finite(result.shadow_near, 0.1), 0.001, 10000);
        result.shadow_far = Math.max(result.shadow_near + 1, clamp(finite(result.shadow_far, 480), 2, 10000));
        result.shadow_resolution = [256, 512, 1024, 2048, 4096, 8192].includes(Number(result.shadow_resolution))
            ? Number(result.shadow_resolution) : 2048;
        result.shadow_bias = clamp(finite(result.shadow_bias, -0.00035), -0.1, 0.1);
        result.shadow_normal_bias = clamp(finite(result.shadow_normal_bias, 0.025), 0, 2);
        result.pixelated_shadows = !!result.pixelated_shadows;
        result.pixel_shadow_steps = Math.round(clamp(finite(result.pixel_shadow_steps, 4), 2, 16));
        result.pixel_shadow_scale = Math.round(clamp(finite(result.pixel_shadow_scale, 2), 1, 16));
        return result;
    }

    function loadSettings() {
        try {
            return normalizeSettings(Object.assign(
                {},
                DEFAULT_SETTINGS,
                JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            ));
        } catch (error) {
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            // Local storage is optional.
        }
        if (typeof Project !== 'undefined' && Project) {
            Project[PROJECT_PROPERTY] = JSON.stringify(settings);
            if (typeof Project.saved === 'boolean') Project.saved = false;
        }
    }

    function hexToRgb(hex) {
        const match = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
        const value = match ? parseInt(match[1], 16) : 0xffffff;
        return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    }

    function mixColor(a, b, amount) {
        const t = clamp(amount, 0, 1);
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    function multiplyColor(color, scalar) {
        return color.map(channel => Math.max(0, channel * scalar));
    }

    function smoothstep(edge0, edge1, value) {
        const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function getSunDirection(timeValue = settings.time) {
        const angle = mod(timeValue, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const horizontal = Math.cos(angle);
        return [
            horizontal * Math.cos(azimuth),
            Math.sin(angle),
            horizontal * Math.sin(azimuth)
        ];
    }

    function getLightingState() {
        const preset = PRESETS[settings.preset] || PRESETS.vanilla;
        const sunDirection = getSunDirection();
        const sunHeight = sunDirection[1];
        const daylight = smoothstep(-0.12, 0.16, sunHeight);
        const night = 1 - smoothstep(-0.28, 0.04, sunHeight);
        const twilight = clamp(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (1 - night * 0.35);

        let zenith = mixColor(hexToRgb(preset.night_zenith), hexToRgb(preset.zenith), daylight);
        let horizon = mixColor(hexToRgb(preset.night_horizon), hexToRgb(preset.horizon), daylight);
        zenith = mixColor(zenith, hexToRgb(preset.sunrise_zenith), twilight * 0.72);
        horizon = mixColor(horizon, hexToRgb(preset.sunrise_horizon), twilight);
        const ground = mixColor(hexToRgb('#070910'), hexToRgb(preset.ground), daylight);
        const ambientColor = mixColor(zenith, horizon, 0.58);
        const ambientIntensity = (preset.ambient_night +
            (preset.ambient_day - preset.ambient_night) * daylight) * settings.environment_strength;
        const celestialDirection = sunHeight >= -0.04 ? sunDirection : sunDirection.map(value => -value);
        const sunColor = sunHeight >= -0.04 ? hexToRgb(preset.sun) : hexToRgb(preset.moon);
        const sunIntensity = settings.sun_enabled
            ? (sunHeight >= -0.04 ? settings.sun_intensity * daylight : settings.moon_intensity * night)
            : 0;

        return {
            enabled: !!settings.enabled,
            preset: settings.preset,
            time: settings.time,
            daylight,
            night,
            twilight,
            sunDirection,
            celestialDirection,
            sunColor,
            sunIntensity,
            celestialSize: settings.celestial_size,
            zenithColor: multiplyColor(zenith, settings.sky_intensity),
            horizonColor: multiplyColor(horizon, settings.sky_intensity),
            groundColor: multiplyColor(ground, settings.sky_intensity),
            cloudColor: hexToRgb(preset.cloud),
            cloudCoverage: settings.cloud_coverage,
            cloudOpacity: settings.clouds_enabled ? settings.cloud_opacity : 0,
            cloudTime: settings.time / 24000 * 180 +
                performance.now() * 0.001 * settings.cloud_speed,
            vibrant: settings.preset === 'vibrant_visuals',
            ambientColor,
            ambientIntensity,
            environmentIntensity: settings.environment_strength,
            pixelatedShadows: settings.pixelated_shadows,
            pixelShadowSteps: settings.pixel_shadow_steps,
            pixelShadowScale: settings.pixel_shadow_scale
        };
    }

    const SKY_VERTEX = [
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = projectionMatrix * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\\n');

    const SKY_FRAGMENT = [
        'precision highp float;',
        '#define PI 3.141592653589793',
        'uniform vec3 uZenith;',
        'uniform vec3 uHorizon;',
        'uniform vec3 uGround;',
        'uniform vec3 uSunDirection;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uMoonColor;',
        'uniform vec3 uCloudColor;',
        'uniform float uDaylight;',
        'uniform float uNight;',
        'uniform float uTwilight;',
        'uniform float uCelestialSize;',
        'uniform float uMoonPhase;',
        'uniform float uStars;',
        'uniform float uCloudCoverage;',
        'uniform float uCloudOpacity;',
        'uniform float uCloudTime;',
        'uniform float uVibrant;',
        'varying vec3 vSkyDirection;',
        'float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float valueNoise(vec2 p) {',
        '    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
        '    return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);',
        '}',
        'float blockClouds(vec2 p) {',
        '    p = floor(p * 3.0) / 3.0;',
        '    return valueNoise(p*.18)*.58 + valueNoise(p*.43+17.0)*.28 + valueNoise(p*.91+31.0)*.14;',
        '}',
        'vec2 celestialCoordinates(vec3 d, vec3 c) {',
        '    vec3 ref = abs(c.y) > .96 ? vec3(1,0,0) : vec3(0,1,0);',
        '    vec3 t = normalize(cross(ref,c)); vec3 b = normalize(cross(c,t));',
        '    float f = max(dot(d,c), .0001); return vec2(dot(d,t),dot(d,b))/f;',
        '}',
        'float squareDisc(vec2 p, float r) {',
        '    float d=max(abs(p.x),abs(p.y)); float a=max(fwidth(d),.0002);',
        '    return 1.0-smoothstep(r-a,r+a,d);',
        '}',
        'void main() {',
        '    vec3 d=normalize(vSkyDirection); float up=d.y;',
        '    float h=pow(1.0-clamp(abs(up),0.0,1.0),mix(2.3,3.4,uVibrant));',
        '    vec3 color=up>=0.0?mix(uZenith,uHorizon,h):mix(uGround,uHorizon,exp(up*7.0));',
        '    float sun=squareDisc(celestialCoordinates(d,uSunDirection),uCelestialSize);',
        '    vec2 moonUv=celestialCoordinates(d,-uSunDirection)/max(uCelestialSize,.001);',
        '    float moonSquare=squareDisc(moonUv*uCelestialSize,uCelestialSize);',
        '    float phaseShift=(uMoonPhase-3.5)/4.0;',
        '    float moon=moonSquare*smoothstep(-.12,.12,.78-abs(moonUv.x+phaseShift));',
        '    color=mix(color,uSunColor,sun*uDaylight); color=mix(color,uMoonColor,moon*uNight);',
        '    if(uStars>0.0&&up>.02){',
        '        vec2 sph=vec2(atan(d.z,d.x)/(2.0*PI),asin(d.y)/PI); vec2 cell=floor(sph*vec2(420,220));',
        '        float star=step(.9915,hash21(cell))*(.45+.55*hash21(cell+9.7));',
        '        color+=vec3(star*smoothstep(.02,.24,up)*uNight*uStars);',
        '    }',
        '    if(uCloudOpacity>0.0&&up>.025){',
        '        vec2 uv=d.xz/max(up,.035)*7.5+vec2(uCloudTime,uCloudTime*.37);',
        '        float cloud=smoothstep(uCloudCoverage-.08,uCloudCoverage+.08,blockClouds(uv));',
        '        cloud*=smoothstep(.025,.13,up)*uCloudOpacity;',
        '        vec3 lit=mix(uCloudColor*.24,uCloudColor,.18+.82*uDaylight);',
        '        lit=mix(lit,vec3(1.0,.42,.22),uTwilight*.34*(1.0-uVibrant)); color=mix(color,lit,cloud);',
        '    }',
        '    gl_FragColor=vec4(max(color,vec3(0)),1);',
        '}'
    ].join('\\n');

    function createSky() {
        if (!window.THREE || !window.Canvas?.scene || skyMesh) return false;
        skyMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Minecraft_Sky',
            uniforms: {
                uZenith: { value: new THREE.Color(0x78a7ff) },
                uHorizon: { value: new THREE.Color(0xb8d2ff) },
                uGround: { value: new THREE.Color(0x536b78) },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uMoonColor: { value: new THREE.Color(0xdbe4ff) },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uDaylight: { value: 1 }, uNight: { value: 0 }, uTwilight: { value: 0 },
                uCelestialSize: { value: settings.celestial_size },
                uMoonPhase: { value: settings.moon_phase },
                uStars: { value: settings.star_brightness },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 }, uVibrant: { value: 0 }
            },
            vertexShader: SKY_VERTEX,
            fragmentShader: SKY_FRAGMENT,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: false,
            toneMapped: false
        });
        skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial);
        skyMesh.name = 'Lightflow Environment Sky';
        skyMesh.frustumCulled = false;
        skyMesh.renderOrder = -100000;
        skyMesh.userData.lightflowEnvironment = true;
        Canvas.scene.add(skyMesh);
        return true;
    }

    function ensureSunLightParent() {
        if (!sunLight || !sunTarget || !window.Canvas?.scene) return;
        const preferredParent = window.three_lights_group || Canvas.scene;
        if (sunLight.parent !== preferredParent) preferredParent.add(sunLight);
        if (sunTarget.parent !== preferredParent) preferredParent.add(sunTarget);
        window.three_lights = window.three_lights || {};
        window.three_lights[sunLight.uuid] = sunLight;
    }

    function createSunLight() {
        if (!window.THREE || !window.Canvas?.scene || sunLight) return false;
        sunLight = new THREE.DirectionalLight(0xfff3c4, 1);
        sunLight.name = 'Lightflow Environment Sun';
        sunLight.userData.lightflowEnvironment = true;
        sunLight.userData.lightflowEnvironmentVirtual = true;
        sunTarget = new THREE.Object3D();
        sunTarget.name = 'Lightflow Environment Sun Target';
        sunLight.target = sunTarget;
        ensureSunLightParent();
        configureSunShadow(true);
        window.LightflowEnvironmentSunLight = sunLight;
        return true;
    }

    function configureSunShadow(force) {
        if (!sunLight?.shadow) return;
        const renderer = window.Preview?.selected?.renderer || window.main_preview?.renderer;
        let maxTextureSize = 4096;
        try {
            const gl = renderer?.getContext?.();
            if (gl) maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || maxTextureSize;
        } catch (error) {
            // Use the conservative fallback.
        }
        const resolution = Math.min(settings.shadow_resolution, maxTextureSize);
        const area = settings.shadow_area;
        const shadow = sunLight.shadow;
        const recreate = force || shadow.mapSize.width !== resolution || shadow.camera.left !== -area;
        sunLight.castShadow = !!settings.sun_cast_shadows;
        shadow.mapSize.set(resolution, resolution);
        Object.assign(shadow.camera, {
            left: -area, right: area, top: area, bottom: -area,
            near: settings.shadow_near, far: settings.shadow_far
        });
        shadow.bias = settings.shadow_bias;
        shadow.normalBias = settings.shadow_normal_bias;
        shadow.radius = settings.pixelated_shadows ? 0 : 1;
        shadow.camera.updateProjectionMatrix?.();
        if (recreate && shadow.map) {
            shadow.map.dispose?.();
            shadow.map = null;
        }
        shadow.needsUpdate = true;
    }

    function setColor(target, value) {
        target?.setRGB?.(value[0], value[1], value[2]);
    }

    function updateScene(options = {}) {
        if (!window.THREE || !window.Canvas?.scene) return;
        createSky();
        createSunLight();
        ensureSunLightParent();
        const state = getLightingState();
        const preset = PRESETS[settings.preset] || PRESETS.vanilla;

        if (skyMesh) skyMesh.visible = !!settings.enabled;
        if (skyMaterial) {
            setColor(skyMaterial.uniforms.uZenith.value, state.zenithColor);
            setColor(skyMaterial.uniforms.uHorizon.value, state.horizonColor);
            setColor(skyMaterial.uniforms.uGround.value, state.groundColor);
            skyMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
            setColor(skyMaterial.uniforms.uSunColor.value, hexToRgb(preset.sun));
            setColor(skyMaterial.uniforms.uMoonColor.value, hexToRgb(preset.moon));
            setColor(skyMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
            skyMaterial.uniforms.uDaylight.value = state.daylight;
            skyMaterial.uniforms.uNight.value = state.night;
            skyMaterial.uniforms.uTwilight.value = state.twilight;
            skyMaterial.uniforms.uCelestialSize.value = settings.celestial_size;
            skyMaterial.uniforms.uMoonPhase.value = settings.moon_phase;
            skyMaterial.uniforms.uStars.value = settings.stars_enabled ? settings.star_brightness : 0;
            skyMaterial.uniforms.uCloudCoverage.value = settings.cloud_coverage;
            skyMaterial.uniforms.uCloudOpacity.value = settings.clouds_enabled ? settings.cloud_opacity : 0;
            skyMaterial.uniforms.uCloudTime.value = settings.time / 24000 * 180 +
                performance.now() * 0.001 * settings.cloud_speed;
            skyMaterial.uniforms.uVibrant.value = settings.preset === 'vibrant_visuals' ? 1 : 0;
        }

        if (sunLight) {
            sunLight.visible = !!(settings.enabled && settings.sun_enabled && state.sunIntensity > 0.0001);
            sunLight.intensity = state.sunIntensity;
            setColor(sunLight.color, state.sunColor);
            sunLight.position.fromArray(state.celestialDirection)
                .multiplyScalar(Math.max(160, settings.shadow_far * 0.38));
            sunTarget.position.set(0, 0, 0);
            configureSunShadow(!!options.forceShadow);
            sunLight.updateMatrixWorld(true);
            sunTarget.updateMatrixWorld(true);
        }

        if (window.ShaderEngine) {
            window.ShaderEngine.environmentState = state;
            window.ShaderEngine.updateLightUniforms?.();
        }
        if (typeof window.LightManagerMarkShadowsDirty === 'function') {
            window.LightManagerMarkShadowsDirty();
        }
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        const previews = new Set();
        if (window.Preview?.selected) previews.add(Preview.selected);
        if (Array.isArray(window.Preview?.all)) Preview.all.forEach(preview => previews.add(preview));
        [window.main_preview, window.MediaPreview].forEach(preview => { if (preview) previews.add(preview); });
        previews.forEach(preview => preview?.render?.());
    }

    function dispatchChanged(cause) {
        const detail = { cause: cause || 'settings', settings: Object.assign({}, settings), state: getLightingState() };
        try {
            window.dispatchEvent(new CustomEvent('lightflow_environment_changed', { detail }));
        } catch (error) {
            // CustomEvent is unavailable in headless validation.
        }
        Blockbench.dispatchEvent?.('lightflow_environment_changed', detail);
    }

    function syncToolbar() {
        timeSlider?.set?.(settings.time);
        if (animateToggle) {
            animateToggle.value = settings.animate_time;
            animateToggle.updateEnabledState?.();
        }
    }

    function applySettings(next, options = {}) {
        settings = normalizeSettings(Object.assign({}, settings, next || {}));
        saveSettings();
        syncToolbar();
        updateScene({ forceShadow: options.forceShadow !== false });
        dispatchChanged(options.cause || 'settings');
        if (options.render !== false) requestPreviewRender();
        return Object.assign({}, settings);
    }

    function applyPreset(presetId, options = {}) {
        const preset = PRESETS[presetId] ? presetId : 'vanilla';
        const vibrant = preset === 'vibrant_visuals';
        return applySettings({
            preset,
            sky_intensity: vibrant ? 1.08 : 1,
            environment_strength: vibrant ? 0.92 : 0.75,
            sun_intensity: vibrant ? 2.8 : 2.2,
            shadow_resolution: vibrant ? 2048 : settings.shadow_resolution,
            pixelated_shadows: vibrant,
            pixel_shadow_steps: vibrant ? 4 : settings.pixel_shadow_steps,
            pixel_shadow_scale: vibrant ? 2 : settings.pixel_shadow_scale,
            cloud_coverage: vibrant ? 0.5 : 0.54,
            cloud_opacity: vibrant ? 0.86 : 0.78
        }, { cause: options.cause || 'preset', forceShadow: true });
    }

    function getVirtualLight() {
        const state = getLightingState();
        if (!sunLight || !state.enabled || !settings.sun_enabled || state.sunIntensity <= 0.0001) return null;
        return {
            uuid: sunLight.uuid,
            light_type: 'directional',
            visibility: true,
            has_shadow: !!settings.sun_cast_shadows,
            render_intensity: state.sunIntensity,
            intensity: state.sunIntensity,
            render_color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            threeLight: sunLight,
            mesh: sunLight
        };
    }

    function createDialogForm() {
        return {
            preset: { type: 'select', label: 'lightflow_environment.field.preset', value: settings.preset,
                options: { vanilla: 'Minecraft Vanilla', vibrant_visuals: 'Minecraft Vibrant Visuals' } },
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            _time: '_',
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100 },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            day_length_seconds: { type: 'number', label: 'lightflow_environment.field.day_length', value: settings.day_length_seconds, min: 10, max: 3600, step: 10, condition: form => !!form.animate_time },
            sun_azimuth: { type: 'range', label: 'lightflow_environment.field.azimuth', value: settings.sun_azimuth, min: 0, max: 360, step: 1 },
            _lighting: '_',
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            sun_enabled: { type: 'checkbox', label: 'lightflow_environment.field.sun_enabled', value: settings.sun_enabled },
            sun_intensity: { type: 'range', label: 'lightflow_environment.field.sun_intensity', value: settings.sun_intensity, min: 0, max: 10, step: 0.05, condition: form => !!form.sun_enabled },
            moon_intensity: { type: 'range', label: 'lightflow_environment.field.moon_intensity', value: settings.moon_intensity, min: 0, max: 2, step: 0.02, condition: form => !!form.sun_enabled },
            celestial_size: { type: 'range', label: 'lightflow_environment.field.celestial_size', value: settings.celestial_size, min: 0.012, max: 0.18, step: 0.002 },
            moon_phase: { type: 'range', label: 'lightflow_environment.field.moon_phase', value: settings.moon_phase, min: 0, max: 7, step: 1 },
            _sky: '_',
            stars_enabled: { type: 'checkbox', label: 'lightflow_environment.field.stars', value: settings.stars_enabled },
            star_brightness: { type: 'range', label: 'lightflow_environment.field.star_brightness', value: settings.star_brightness, min: 0, max: 3, step: 0.05, condition: form => !!form.stars_enabled },
            clouds_enabled: { type: 'checkbox', label: 'lightflow_environment.field.clouds', value: settings.clouds_enabled },
            cloud_coverage: { type: 'range', label: 'lightflow_environment.field.cloud_coverage', value: settings.cloud_coverage, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_opacity: { type: 'range', label: 'lightflow_environment.field.cloud_opacity', value: settings.cloud_opacity, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_speed: { type: 'range', label: 'lightflow_environment.field.cloud_speed', value: settings.cloud_speed, min: -0.2, max: 0.2, step: 0.002, condition: form => !!form.clouds_enabled },
            _shadows: '_',
            sun_cast_shadows: { type: 'checkbox', label: 'lightflow_environment.field.cast_shadows', value: settings.sun_cast_shadows, condition: form => !!form.sun_enabled },
            shadow_area: { type: 'number', label: 'lightflow_environment.field.shadow_area', value: settings.shadow_area, min: 2, max: 1024, step: 1, condition: form => !!form.sun_cast_shadows },
            shadow_resolution: { type: 'select', label: 'lightflow_environment.field.shadow_resolution', value: String(settings.shadow_resolution),
                options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096', '8192': '8192' }, condition: form => !!form.sun_cast_shadows },
            shadow_near: { type: 'number', label: 'lightflow_environment.field.shadow_near', value: settings.shadow_near, min: 0.001, step: 0.1, condition: form => !!form.sun_cast_shadows },
            shadow_far: { type: 'number', label: 'lightflow_environment.field.shadow_far', value: settings.shadow_far, min: 2, step: 1, condition: form => !!form.sun_cast_shadows },
            shadow_bias: { type: 'number', label: 'lightflow_environment.field.shadow_bias', value: settings.shadow_bias, min: -0.1, max: 0.1, step: 0.00005, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias: { type: 'number', label: 'lightflow_environment.field.normal_bias', value: settings.shadow_normal_bias, min: 0, max: 2, step: 0.005, condition: form => !!form.sun_cast_shadows },
            pixelated_shadows: { type: 'checkbox', label: 'lightflow_environment.field.pixelated_shadows', value: settings.pixelated_shadows, condition: form => !!form.sun_cast_shadows },
            pixel_shadow_steps: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_steps', value: settings.pixel_shadow_steps, min: 2, max: 16, step: 1, condition: form => !!form.pixelated_shadows },
            pixel_shadow_scale: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_scale', value: settings.pixel_shadow_scale, min: 1, max: 16, step: 1, condition: form => !!form.pixelated_shadows }
        };
    }

    function openSettingsDialog() {
        new Dialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 720,
            form: createDialogForm(),
            onFormChange(form) {
                applySettings(form, { cause: 'dialog_preview', forceShadow: false });
            },
            onConfirm(form) {
                applySettings(form, { cause: 'dialog_confirm', forceShadow: true });
            }
        }).show();
    }

    function installUI() {
        settingsAction = new Action('lightflow_environment_composer', {
            name: 'lightflow_environment.action.open',
            description: 'lightflow_environment.action.open.desc',
            icon: 'wb_twilight',
            category: 'view',
            condition: () => !!window.Project,
            click: openSettingsDialog
        });
        timeSlider = new NumSlider('lightflow_environment_time', {
            name: 'lightflow_environment.field.time',
            icon: 'schedule',
            category: 'view',
            condition: () => !!window.Project,
            value: settings.time,
            min: 0, max: 23999, step: 100,
            onChange() {
                applySettings({ time: this.value }, { cause: 'time_slider', forceShadow: true });
            }
        });
        animateToggle = new Toggle('lightflow_environment_animate', {
            name: 'lightflow_environment.field.animate',
            icon: 'play_circle',
            category: 'view',
            condition: () => !!window.Project,
            value: settings.animate_time,
            onChange(value) {
                applySettings({ animate_time: !!value }, { cause: 'animate_toggle', forceShadow: false });
            }
        });
        const toolbar = new Toolbar({
            id: 'lightflow_environment_toolbar',
            name: 'lightflow_environment.plugin.title',
            children: ['lightflow_environment_composer', 'lightflow_environment_time', 'lightflow_environment_animate']
        });
        const panel = new Panel('lightflow_environment_panel', {
            name: 'lightflow_environment.plugin.title',
            icon: 'wb_twilight',
            condition: () => !!window.Project,
            default_position: { slot: 'right_bar', height: 58, folded: false },
            toolbars: [toolbar]
        });
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, timeSlider, animateToggle, toolbar, panel);
        syncToolbar();
    }

    function installTranslations() {
        const translations = {
            'lightflow_environment.plugin.title': 'Lightflow Environment',
            'lightflow_environment.action.open': 'Environment Composer...',
            'lightflow_environment.action.open.desc': 'Compose a Minecraft sky, time, sun, moon, clouds, ambient response, and directional shadows',
            'lightflow_environment.dialog.title': 'Minecraft Environment Composer',
            'lightflow_environment.field.preset': 'Sky Model',
            'lightflow_environment.field.enabled': 'Render Environment',
            'lightflow_environment.field.time': 'Minecraft Time',
            'lightflow_environment.field.animate': 'Animate Day Cycle',
            'lightflow_environment.field.day_length': 'Full Day Length (seconds)',
            'lightflow_environment.field.azimuth': 'Sun Path Rotation',
            'lightflow_environment.field.sky_intensity': 'Sky Brightness',
            'lightflow_environment.field.environment': 'Environment Influence',
            'lightflow_environment.field.sun_enabled': 'Sun / Moon Light',
            'lightflow_environment.field.sun_intensity': 'Sun Intensity',
            'lightflow_environment.field.moon_intensity': 'Moon Intensity',
            'lightflow_environment.field.celestial_size': 'Sun / Moon Size',
            'lightflow_environment.field.moon_phase': 'Moon Phase',
            'lightflow_environment.field.stars': 'Stars',
            'lightflow_environment.field.star_brightness': 'Star Brightness',
            'lightflow_environment.field.clouds': 'Minecraft Clouds',
            'lightflow_environment.field.cloud_coverage': 'Cloud Coverage',
            'lightflow_environment.field.cloud_opacity': 'Cloud Opacity',
            'lightflow_environment.field.cloud_speed': 'Cloud Speed',
            'lightflow_environment.field.cast_shadows': 'Sun Cast Shadows',
            'lightflow_environment.field.shadow_area': 'Shadow Capture Area',
            'lightflow_environment.field.shadow_resolution': 'Shadow Resolution',
            'lightflow_environment.field.shadow_near': 'Shadow Near Plane',
            'lightflow_environment.field.shadow_far': 'Shadow Far Plane',
            'lightflow_environment.field.shadow_bias': 'Shadow Bias',
            'lightflow_environment.field.normal_bias': 'Shadow Normal Bias',
            'lightflow_environment.field.pixelated_shadows': 'Vibrant Visuals Pixel Shadows',
            'lightflow_environment.field.pixel_shadow_steps': 'Shadow Tone Steps',
            'lightflow_environment.field.pixel_shadow_scale': 'Shadow Pixel Size'
        };
        Language.addTranslations('en', translations);
        Language.addTranslations('es', Object.assign({}, translations, {
            'lightflow_environment.plugin.title': 'Entorno Lightflow',
            'lightflow_environment.action.open': 'Compositor de entorno...',
            'lightflow_environment.dialog.title': 'Compositor de entorno Minecraft',
            'lightflow_environment.field.preset': 'Modelo de cielo',
            'lightflow_environment.field.enabled': 'Renderizar entorno',
            'lightflow_environment.field.time': 'Hora de Minecraft',
            'lightflow_environment.field.animate': 'Animar ciclo del día',
            'lightflow_environment.field.environment': 'Influencia del entorno',
            'lightflow_environment.field.cast_shadows': 'El sol proyecta sombras',
            'lightflow_environment.field.shadow_area': 'Área de captura de sombras',
            'lightflow_environment.field.pixelated_shadows': 'Sombras pixeladas Vibrant Visuals'
        }));
    }

    function registerProjectProperty() {
        if (projectProperty || typeof Property === 'undefined') return projectProperty;
        const projectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (window.Project?.constructor && Project.constructor !== Object ? Project.constructor : null);
        if (!projectClass) return null;
        projectProperty = new Property(projectClass, 'string', PROJECT_PROPERTY, { default: '', exposed: true });
        deletables.push(projectProperty);
        return projectProperty;
    }

    function loadProjectSettings(project) {
        const activeProject = project || window.Project;
        if (!activeProject) return;
        const raw = activeProject[PROJECT_PROPERTY];
        if (typeof raw === 'string' && raw.trim()) {
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)));
            } catch (error) {
                settings = loadSettings();
            }
        } else {
            settings = loadSettings();
        }
        syncToolbar();
        updateScene({ forceShadow: true });
        dispatchChanged('project_load');
        requestPreviewRender();
    }

    function startAnimation() {
        const tick = timestamp => {
            animationFrame = requestAnimationFrame(tick);
            if (!lastFrameTime) lastFrameTime = timestamp;
            const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTime) / 1000));
            lastFrameTime = timestamp;
            ensureSunLightParent();
            if (!settings.animate_time || !settings.enabled || window.LightManagerStudioRenderSession) return;
            settings.time = mod(settings.time + deltaSeconds * 24000 / Math.max(settings.day_length_seconds, 1), 24000);
            if (timestamp - lastRenderTime < 33) return;
            lastRenderTime = timestamp;
            syncToolbar();
            updateScene({ forceShadow: true });
            dispatchChanged('animation');
            requestPreviewRender();
        };
        animationFrame = requestAnimationFrame(tick);
    }

    function disposeScene() {
        if (sunLight) {
            if (window.three_lights?.[sunLight.uuid] === sunLight) delete window.three_lights[sunLight.uuid];
            sunLight.parent?.remove?.(sunLight);
            sunLight.shadow?.map?.dispose?.();
        }
        sunTarget?.parent?.remove?.(sunTarget);
        skyMesh?.parent?.remove?.(skyMesh);
        skyMesh?.geometry?.dispose?.();
        skyMaterial?.dispose?.();
        sunLight = null;
        sunTarget = null;
        skyMesh = null;
        skyMaterial = null;
        delete window.LightflowEnvironmentSunLight;
    }

    installTranslations();

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Environment',
        icon: 'wb_twilight',
        author: 'MidFord327',
        description: 'Procedural Minecraft Vanilla and Vibrant Visuals skies with time, sun/moon lighting, ambient material response, reflections, clouds, and directional shadows.',
        tags: ['Lightflow', 'Environment', 'Minecraft', 'Sky', 'Lighting', 'Vibrant Visuals'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',

        onload() {
            registerProjectProperty();
            installUI();
            createSky();
            createSunLight();
            updateScene({ forceShadow: true });

            window.LightflowEnvironment = {
                get settings() { return Object.assign({}, settings); },
                setSettings: applySettings,
                applyPreset,
                open: openSettingsDialog,
                getLightingState,
                getVirtualLight,
                getDirectionalLight: () => sunLight,
                refresh() {
                    updateScene({ forceShadow: true });
                    requestPreviewRender();
                }
            };

            const selectListener = Blockbench.on('select_project', event => loadProjectSettings(event?.project));
            const loadListener = Blockbench.on('load_project', event => loadProjectSettings(event?.project));
            const parsedListener = window.Codecs?.project?.on?.('parsed', () => loadProjectSettings(window.Project));
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(selectListener, loadListener, parsedListener, {
                delete() { window.removeEventListener('light_manager_initialized', lightManagerListener); }
            });
            startAnimation();
            dispatchChanged('load');
            requestPreviewRender();
        },

        onunload() {
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            disposeScene();
            deletables.splice(0).reverse().forEach(item => item?.delete?.());
            delete window.LightflowEnvironment;
            window.ShaderEngine?.updateLightUniforms?.();
            requestPreviewRender();
        }
    });
})();
