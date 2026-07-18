(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.3.0';
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
        palette_mode: 'preset',
        zenith_color: '#78a7ff',
        horizon_color: '#b8d2ff',
        sunrise_zenith_color: '#647db5',
        sunrise_horizon_color: '#f59a62',
        night_zenith_color: '#05091d',
        night_horizon_color: '#151d3d',
        ground_color: '#536b78',
        sun_color: '#fff3c4',
        moon_color: '#dbe4ff',
        cloud_color: '#f3f5f7',
        sky_intensity: 1,
        sky_gradient_power: 2.3,
        star_density: 1,
        environment_strength: 0.75,
        sun_enabled: true,
        sun_intensity: 2.2,
        moon_intensity: 0.28,
        celestial_size: 0.055,
        moon_phase: 0,
        sun_mode: 'vanilla',
        moon_mode: 'vanilla',
        sun_texture_uuid: '',
        moon_texture_uuid: '',
        stars_enabled: true,
        star_brightness: 0.72,
        clouds_enabled: true,
        cloud_mode: 'vanilla',
        cloud_texture_uuid: '',
        cloud_coverage: 0.54,
        cloud_opacity: 0.78,
        cloud_speed: 0.016,
        cloud_scale: 1,
        cloud_direction: 0,
        cloud_contrast: 1,
        cloud_brightness: 1,
        sun_cast_shadows: true,
        shadow_area: 48,
        shadow_near: 0.1,
        shadow_far: 480,
        shadow_resolution: 2048,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.025,
        shadow_auto_fit: true,
        shadow_fit_corners: null,
        show_shadow_gizmo: true,
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
    let sunShadowGizmo = null;
    let sunShadowGizmoDrag = null;
    let sunShadowGizmoRaycaster = null;
    let sunShadowGizmoMouse = null;
    let effectiveShadowFrustum = null;
    const sunShadowGizmoListeners = [];
    let settingsAction = null;
    let environmentPanel = null;
    let syncingEnvironmentPanel = false;
    let vanillaCloudTexture = null;
    let fallbackTexture = null;
    let projectProperty = null;
    let animationFrame = null;
    let previewRenderFrame = null;
    let lastFrameTime = 0;
    let lastRenderTime = 0;
    let environmentRevision = 0;
    let environmentProject = null;
    let lastSunShadowConfig = '';
    let lastSunShadowDirection = null;
    let lastSunShadowRefresh = 0;
    let lastSunShadowGizmoSignature = '';
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

    function markerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        return window.LightManagerUI?.markerColor?.(index, tone, fallback) || fallback;
    }

    function normalizeHex(value, fallback) {
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        return match ? '#' + match[1].toLowerCase() : fallback;
    }

    function normalizeSettings(source) {
        const result = Object.assign({}, DEFAULT_SETTINGS, source || {});
        result.enabled = result.enabled !== false;
        result.preset = PRESETS[result.preset] ? result.preset : 'vanilla';
        result.time = mod(finite(result.time, 6000), 24000);
        result.animate_time = !!result.animate_time;
        result.day_length_seconds = clamp(finite(result.day_length_seconds, 120), 10, 3600);
        result.sun_azimuth = mod(finite(result.sun_azimuth, 0), 360);
        result.palette_mode = result.palette_mode === 'custom' ? 'custom' : 'preset';
        result.zenith_color = normalizeHex(result.zenith_color, DEFAULT_SETTINGS.zenith_color);
        result.horizon_color = normalizeHex(result.horizon_color, DEFAULT_SETTINGS.horizon_color);
        result.sunrise_zenith_color = normalizeHex(result.sunrise_zenith_color, DEFAULT_SETTINGS.sunrise_zenith_color);
        result.sunrise_horizon_color = normalizeHex(result.sunrise_horizon_color, DEFAULT_SETTINGS.sunrise_horizon_color);
        result.night_zenith_color = normalizeHex(result.night_zenith_color, DEFAULT_SETTINGS.night_zenith_color);
        result.night_horizon_color = normalizeHex(result.night_horizon_color, DEFAULT_SETTINGS.night_horizon_color);
        result.ground_color = normalizeHex(result.ground_color, DEFAULT_SETTINGS.ground_color);
        result.sun_color = normalizeHex(result.sun_color, DEFAULT_SETTINGS.sun_color);
        result.moon_color = normalizeHex(result.moon_color, DEFAULT_SETTINGS.moon_color);
        result.cloud_color = normalizeHex(result.cloud_color, DEFAULT_SETTINGS.cloud_color);
        result.sky_intensity = clamp(finite(result.sky_intensity, 1), 0, 4);
        result.sky_gradient_power = clamp(finite(result.sky_gradient_power, 2.3), 0.5, 8);
        result.star_density = clamp(finite(result.star_density, 1), 0.1, 4);
        result.environment_strength = clamp(finite(result.environment_strength, 0.75), 0, 4);
        result.sun_enabled = result.sun_enabled !== false;
        result.sun_intensity = clamp(finite(result.sun_intensity, 2.2), 0, 20);
        result.moon_intensity = clamp(finite(result.moon_intensity, 0.28), 0, 5);
        result.celestial_size = clamp(finite(result.celestial_size, 0.055), 0.012, 0.18);
        result.moon_phase = Math.round(clamp(finite(result.moon_phase, 0), 0, 7));
        result.sun_mode = ['vanilla', 'texture', 'hidden'].includes(result.sun_mode) ? result.sun_mode : 'vanilla';
        result.moon_mode = ['vanilla', 'texture', 'hidden'].includes(result.moon_mode) ? result.moon_mode : 'vanilla';
        result.sun_texture_uuid = typeof result.sun_texture_uuid === 'string' ? result.sun_texture_uuid : '';
        result.moon_texture_uuid = typeof result.moon_texture_uuid === 'string' ? result.moon_texture_uuid : '';
        result.stars_enabled = result.stars_enabled !== false;
        result.star_brightness = clamp(finite(result.star_brightness, 0.72), 0, 3);
        result.clouds_enabled = result.clouds_enabled !== false;
        result.cloud_mode = ['procedural', 'vanilla', 'texture'].includes(result.cloud_mode) ? result.cloud_mode : 'vanilla';
        result.cloud_texture_uuid = typeof result.cloud_texture_uuid === 'string' ? result.cloud_texture_uuid : '';
        result.cloud_coverage = clamp(finite(result.cloud_coverage, 0.54), 0, 1);
        result.cloud_opacity = clamp(finite(result.cloud_opacity, 0.78), 0, 1);
        result.cloud_speed = clamp(finite(result.cloud_speed, 0.016), -1, 1);
        result.cloud_scale = clamp(finite(result.cloud_scale, 1), 0.05, 16);
        result.cloud_direction = mod(finite(result.cloud_direction, 0), 360);
        result.cloud_contrast = clamp(finite(result.cloud_contrast, 1), 0.1, 4);
        result.cloud_brightness = clamp(finite(result.cloud_brightness, 1), 0, 4);
        result.sun_cast_shadows = result.sun_cast_shadows !== false;
        result.shadow_area = clamp(finite(result.shadow_area, 48), 2, 100000);
        result.shadow_near = clamp(finite(result.shadow_near, 0.1), 0.001, 100000);
        result.shadow_far = Math.max(result.shadow_near + 1, clamp(finite(result.shadow_far, 480), 2, 100000));
        result.shadow_resolution = [256, 512, 1024, 2048, 4096, 8192].includes(Number(result.shadow_resolution))
            ? Number(result.shadow_resolution) : 2048;
        result.shadow_bias = clamp(finite(result.shadow_bias, -0.00035), -0.1, 0.1);
        result.shadow_normal_bias = clamp(finite(result.shadow_normal_bias, 0.025), 0, 2);
        result.shadow_auto_fit = result.shadow_auto_fit !== false;
        result.shadow_fit_corners = Array.isArray(result.shadow_fit_corners) && result.shadow_fit_corners.length === 24 &&
            result.shadow_fit_corners.every(value => Number.isFinite(Number(value)))
            ? result.shadow_fit_corners.map(Number)
            : null;
        result.show_shadow_gizmo = result.show_shadow_gizmo !== false;
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

    function getPalette() {
        if (settings.palette_mode !== 'custom') return PRESETS[settings.preset] || PRESETS.vanilla;
        return {
            name: 'Custom',
            zenith: settings.zenith_color,
            horizon: settings.horizon_color,
            sunrise_zenith: settings.sunrise_zenith_color,
            sunrise_horizon: settings.sunrise_horizon_color,
            night_zenith: settings.night_zenith_color,
            night_horizon: settings.night_horizon_color,
            ground: settings.ground_color,
            sun: settings.sun_color,
            moon: settings.moon_color,
            cloud: settings.cloud_color,
            ambient_day: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_day,
            ambient_night: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_night
        };
    }

    function getTextureOptions() {
        const options = { '': tr('lightflow_environment.option.texture_none', 'Select a project texture') };
        if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
            Texture.all.forEach((texture, index) => {
                if (!texture?.uuid) return;
                options[texture.uuid] = texture.name || texture.path || `Texture ${index + 1}`;
            });
        }
        return options;
    }

    function getBlockbenchTextureMap(uuid) {
        if (!uuid || typeof Texture === 'undefined' || !Array.isArray(Texture.all)) return null;
        const texture = Texture.all.find(candidate => candidate?.uuid === uuid);
        if (!texture) return null;
        const material = texture.getOwnMaterial?.() || texture.getMaterial?.() || texture.material;
        const map = material?.map || material?.uniforms?.map?.value || texture.texture || texture.three_texture;
        if (map?.isTexture) return map;
        const image = texture.canvas || texture.img || texture.image;
        if (!image || !window.THREE) return null;
        if (!texture._lightflowEnvironmentTexture) {
            texture._lightflowEnvironmentTexture = new THREE.Texture(image);
            texture._lightflowEnvironmentTexture.needsUpdate = true;
        }
        return texture._lightflowEnvironmentTexture;
    }

    function createCanvasTexture(canvas, name) {
        const texture = THREE.CanvasTexture ? new THREE.CanvasTexture(canvas) : new THREE.Texture(canvas);
        texture.name = name;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    function ensureSkyTextures() {
        if (!window.THREE || typeof document === 'undefined') return;
        if (!fallbackTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, 1, 1);
            fallbackTexture = createCanvasTexture(canvas, 'Lightflow_Environment_Fallback');
        }
        if (!vanillaCloudTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, 64, 64);
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const seed = Math.sin((x + 19) * 12.9898 + (y + 7) * 78.233) * 43758.5453;
                    const value = seed - Math.floor(seed);
                    if (value < 0.48) continue;
                    const shade = Math.round(214 + value * 41);
                    context.fillStyle = `rgba(${shade},${shade},${shade},${0.72 + value * 0.28})`;
                    context.fillRect(x * 4, y * 4, 4, 4);
                }
            }
            vanillaCloudTexture = createCanvasTexture(canvas, 'Lightflow_VanillaStyle_Clouds');
        }
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
        const preset = getPalette();
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
            cloudMode: settings.cloud_mode,
            cloudScale: settings.cloud_scale,
            cloudDirection: settings.cloud_direction,
            cloudContrast: settings.cloud_contrast,
            cloudBrightness: settings.cloud_brightness,
            cloudTime: settings.time / 24000 * 180 +
                performance.now() * 0.001 * settings.cloud_speed,
            skyGradientPower: settings.sky_gradient_power,
            starDensity: settings.star_density,
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
    ].join('\n');

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
        'uniform float uSkyGradientPower;',
        'uniform float uStarDensity;',
        'uniform int uSunMode;',
        'uniform int uMoonMode;',
        'uniform int uCloudMode;',
        'uniform sampler2D uSunTexture;',
        'uniform sampler2D uMoonTexture;',
        'uniform sampler2D uCloudTexture;',
        'uniform float uCloudScale;',
        'uniform float uCloudDirection;',
        'uniform float uCloudContrast;',
        'uniform float uCloudBrightness;',
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
        '    float h=pow(1.0-clamp(abs(up),0.0,1.0),max(.1,uSkyGradientPower+uVibrant*1.1));',
        '    vec3 color=up>=0.0?mix(uZenith,uHorizon,h):mix(uGround,uHorizon,exp(up*7.0));',
        '    vec2 sunCoord=celestialCoordinates(d,uSunDirection);',
        '    vec2 sunUv=sunCoord/max(uCelestialSize*2.0,.001)+.5;',
        '    float sunInside=step(0.0,sunUv.x)*step(sunUv.x,1.0)*step(0.0,sunUv.y)*step(sunUv.y,1.0);',
        '    vec4 sunTex=texture2D(uSunTexture,clamp(sunUv,0.0,1.0));',
        '    float sunTexMask=sunTex.a<.999?sunTex.a:max(sunTex.r,max(sunTex.g,sunTex.b));',
        '    float sun=uSunMode==0?squareDisc(sunCoord,uCelestialSize):(uSunMode==1?sunInside*sunTexMask:0.0);',
        '    vec2 moonUv=celestialCoordinates(d,-uSunDirection)/max(uCelestialSize,.001);',
        '    vec2 moonTexUv=moonUv*.5+.5;',
        '    float moonInside=step(0.0,moonTexUv.x)*step(moonTexUv.x,1.0)*step(0.0,moonTexUv.y)*step(moonTexUv.y,1.0);',
        '    vec4 moonTex=texture2D(uMoonTexture,clamp(moonTexUv,0.0,1.0));',
        '    float moonTexMask=moonTex.a<.999?moonTex.a:max(moonTex.r,max(moonTex.g,moonTex.b));',
        '    float moonSquare=uMoonMode==0?squareDisc(moonUv*uCelestialSize,uCelestialSize):(uMoonMode==1?moonInside*moonTexMask:0.0);',
        '    float phaseShift=(uMoonPhase-3.5)/4.0;',
        '    float moon=moonSquare*smoothstep(-.12,.12,.78-abs(moonUv.x+phaseShift));',
        '    vec3 sunDisplay=uSunMode==1?sunTex.rgb*uSunColor:uSunColor;',
        '    vec3 moonDisplay=uMoonMode==1?moonTex.rgb*uMoonColor:uMoonColor;',
        '    color=mix(color,sunDisplay,sun*uDaylight); color=mix(color,moonDisplay,moon*uNight);',
        '    if(uStars>0.0&&up>.02){',
        '        vec2 sph=vec2(atan(d.z,d.x)/(2.0*PI),asin(d.y)/PI); vec2 cell=floor(sph*vec2(420,220));',
        '        float star=step(1.0-.0085*clamp(uStarDensity,.1,4.0),hash21(cell))*(.45+.55*hash21(cell+9.7));',
        '        color+=vec3(star*smoothstep(.02,.24,up)*uNight*uStars);',
        '    }',
        '    if(uCloudOpacity>0.0&&up>.025){',
        '        float cs=cos(uCloudDirection), sn=sin(uCloudDirection);',
        '        vec2 drift=vec2(cs,sn)*uCloudTime;',
        '        vec2 uv=(d.xz/max(up,.035)*7.5+drift)*max(uCloudScale,.01);',
        '        float cloudSource=blockClouds(uv);',
        '        if(uCloudMode>0){vec4 cloudTex=texture2D(uCloudTexture,fract(uv*.035)); cloudSource=cloudTex.a<.999?cloudTex.a:dot(cloudTex.rgb,vec3(.299,.587,.114));}',
        '        cloudSource=clamp((cloudSource-.5)*uCloudContrast+.5,0.0,1.0);',
        '        float cloud=smoothstep(uCloudCoverage-.08,uCloudCoverage+.08,cloudSource);',
        '        cloud*=smoothstep(.025,.13,up)*uCloudOpacity;',
        '        vec3 lit=mix(uCloudColor*.24,uCloudColor,.18+.82*uDaylight)*uCloudBrightness;',
        '        lit=mix(lit,vec3(1.0,.42,.22),uTwilight*.34*(1.0-uVibrant)); color=mix(color,lit,cloud);',
        '    }',
        '    gl_FragColor=vec4(max(color,vec3(0)),1);',
        '}'
    ].join('\n');

    function createSky() {
        if (!window.THREE || !window.Canvas?.scene || skyMesh) return false;
        ensureSkyTextures();
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
                uCloudTime: { value: 0 }, uVibrant: { value: 0 },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uStarDensity: { value: settings.star_density },
                uSunMode: { value: 0 }, uMoonMode: { value: 0 }, uCloudMode: { value: 1 },
                uSunTexture: { value: fallbackTexture },
                uMoonTexture: { value: fallbackTexture },
                uCloudTexture: { value: vanillaCloudTexture || fallbackTexture },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness }
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

    function getActiveShadowFrustum() {
        return effectiveShadowFrustum || {
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        };
    }

    function getShadowViewQuaternion(position, target) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, new THREE.Vector3(0, 1, 0));
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }

    function buildShadowFrustumWorldCorners(frustum, position, quaternion) {
        const area = Math.max(0.001, finite(frustum.area, settings.shadow_area));
        const near = Math.max(0.001, finite(frustum.near, settings.shadow_near));
        const far = Math.max(near + 0.001, finite(frustum.far, settings.shadow_far));
        const corners = [];
        [-near, -far].forEach(z => {
            [-area, area].forEach(x => {
                [-area, area].forEach(y => {
                    corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(position));
                });
            });
        });
        return corners;
    }

    function getBoxWorldCorners(box) {
        const min = box.min;
        const max = box.max;
        return [
            new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z)
        ];
    }

    function getWorldAlignedShadowCorners(corners) {
        const box = new THREE.Box3().setFromPoints(corners);
        return box.isEmpty() ? [] : getBoxWorldCorners(box);
    }

    function getReferenceShadowFitCorners() {
        const referenceDirection = new THREE.Vector3().fromArray(getSunDirection(6000)).normalize();
        const referenceDistance = Math.max(160, settings.shadow_far * 0.38);
        const position = referenceDirection.multiplyScalar(referenceDistance);
        const target = new THREE.Vector3(0, 0, 0);
        const quaternion = getShadowViewQuaternion(position, target);
        return getWorldAlignedShadowCorners(buildShadowFrustumWorldCorners({
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        }, position, quaternion));
    }

    function getShadowFitCorners() {
        if (Array.isArray(settings.shadow_fit_corners) && settings.shadow_fit_corners.length === 24) {
            const corners = [];
            for (let index = 0; index < settings.shadow_fit_corners.length; index += 3) {
                corners.push(new THREE.Vector3(
                    settings.shadow_fit_corners[index],
                    settings.shadow_fit_corners[index + 1],
                    settings.shadow_fit_corners[index + 2]
                ));
            }
            return getWorldAlignedShadowCorners(corners);
        }
        return getReferenceShadowFitCorners();
    }

    function updateSunShadowPlacement(celestialDirection) {
        if (!sunLight || !sunTarget) return;
        const direction = new THREE.Vector3().fromArray(celestialDirection);
        if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
        else direction.normalize();

        /*
         * The marked region stays fixed in world space. Only the directional
         * shadow camera moves with the celestial light, so refit its symmetric
         * orthographic bounds and depth range around the same eight corners.
        */
        const fitCorners = settings.shadow_auto_fit ? getShadowFitCorners() : null;
        const targetPosition = fitCorners
            ? new THREE.Box3().setFromPoints(fitCorners).getCenter(new THREE.Vector3())
            : new THREE.Vector3(0, 0, 0);
        const nearestRegionProjection = fitCorners
            ? fitCorners.reduce((projection, corner) => Math.max(
                projection,
                corner.clone().sub(targetPosition).dot(direction)
            ), -Infinity)
            : 0;
        const distance = settings.shadow_auto_fit
            ? Math.max(160, nearestRegionProjection + 1)
            : Math.max(160, settings.shadow_far * 0.38);
        const lightPosition = targetPosition.clone().add(direction.multiplyScalar(distance));
        sunLight.position.copy(lightPosition);
        sunTarget.position.copy(targetPosition);
        sunLight.updateMatrixWorld(true);
        sunTarget.updateMatrixWorld(true);

        if (!fitCorners) {
            effectiveShadowFrustum = {
                area: settings.shadow_area,
                near: settings.shadow_near,
                far: settings.shadow_far
            };
            return;
        }

        const viewQuaternion = getShadowViewQuaternion(lightPosition, targetPosition);
        const inverseViewQuaternion = viewQuaternion.clone().invert();
        let area = 0;
        let near = Infinity;
        let far = -Infinity;
        fitCorners.forEach(corner => {
            const local = corner.clone().sub(lightPosition).applyQuaternion(inverseViewQuaternion);
            area = Math.max(area, Math.abs(local.x), Math.abs(local.y));
            const depth = -local.z;
            near = Math.min(near, depth);
            far = Math.max(far, depth);
        });

        const lateralPadding = Math.max(0.25, area * 0.015);
        const depthSpan = Math.max(1, far - near);
        const depthPadding = Math.max(0.5, depthSpan * 0.01);
        effectiveShadowFrustum = {
            area: Math.max(2, area + lateralPadding),
            near: Math.max(0.001, near - depthPadding),
            far: Math.max(Math.max(0.001, near - depthPadding) + 1, far + depthPadding)
        };
    }

    function captureShadowFitRegion(frustum) {
        if (!sunLight || !sunTarget) return;
        const position = new THREE.Vector3();
        const target = new THREE.Vector3();
        sunLight.getWorldPosition(position);
        sunTarget.getWorldPosition(target);
        if (sunShadowGizmoDrag?.viewPosition) position.copy(sunShadowGizmoDrag.viewPosition);
        const quaternion = sunShadowGizmoDrag?.viewQuaternion
            ? sunShadowGizmoDrag.viewQuaternion.clone()
            : sunShadowGizmo?.root
                ? sunShadowGizmo.root.quaternion.clone()
                : getShadowViewQuaternion(position, target);
        const corners = getWorldAlignedShadowCorners(
            buildShadowFrustumWorldCorners(frustum, position, quaternion)
        );
        settings.shadow_fit_corners = corners.flatMap(corner => corner.toArray());
    }

    function configureSunShadow(force, options = {}) {
        if (!sunLight?.shadow) return false;
        const renderer = window.Preview?.selected?.renderer || window.main_preview?.renderer;
        let maxTextureSize = 4096;
        try {
            const gl = renderer?.getContext?.();
            if (gl) maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || maxTextureSize;
        } catch (error) {
            // Use the conservative fallback.
        }
        const resolution = Math.min(settings.shadow_resolution, maxTextureSize);
        const frustum = getActiveShadowFrustum();
        const area = frustum.area;
        const shadow = sunLight.shadow;
        const state = options.state || getLightingState();
        // Keep shadow-light topology stable while Environment/Sun is toggled.
        // Manual shadow invalidation means an intensity-zero light does not
        // keep paying for shadow passes, while Three can reuse its programs.
        const castsShadow = !!settings.sun_cast_shadows;
        const radius = settings.pixelated_shadows ? 0 : 1;
        const configSignature = [
            castsShadow ? 1 : 0,
            resolution,
            area,
            frustum.near,
            frustum.far,
            settings.shadow_bias,
            settings.shadow_normal_bias,
            radius
        ].map(value => Number(value).toFixed(5)).join('|');
        const configChanged = configSignature !== lastSunShadowConfig;
        const resolutionChanged = shadow.mapSize.width !== resolution || shadow.mapSize.height !== resolution;
        let cameraChanged = false;

        if (sunLight.castShadow !== castsShadow) sunLight.castShadow = castsShadow;
        if (resolutionChanged) {
            shadow.mapSize.set(resolution, resolution);
            if (shadow.map?.setSize) {
                shadow.map.setSize(resolution, resolution);
            } else if (shadow.map) {
                shadow.map.dispose?.();
                shadow.map = null;
            }
        }
        const cameraValues = {
            left: -area, right: area, top: area, bottom: -area,
            near: frustum.near, far: frustum.far
        };
        Object.entries(cameraValues).forEach(([key, value]) => {
            if (shadow.camera[key] === value) return;
            shadow.camera[key] = value;
            cameraChanged = true;
        });
        if (shadow.bias !== settings.shadow_bias) shadow.bias = settings.shadow_bias;
        if (shadow.normalBias !== settings.shadow_normal_bias) shadow.normalBias = settings.shadow_normal_bias;
        if (shadow.radius !== radius) shadow.radius = radius;
        if (cameraChanged) shadow.camera.updateProjectionMatrix?.();

        const direction = sunLight.position.clone().sub(sunTarget?.position || new THREE.Vector3()).normalize();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const directionAngle = lastSunShadowDirection
            ? Math.acos(clamp(lastSunShadowDirection.dot(direction), -1, 1))
            : Infinity;
        const animatedDirectionDue = options.animation === true
            ? (directionAngle >= THREE.MathUtils.degToRad(0.35) || now - lastSunShadowRefresh >= 100)
            : directionAngle > 0.000001;
        const changed = !!(force || configChanged || resolutionChanged || cameraChanged || animatedDirectionDue);
        lastSunShadowConfig = configSignature;
        if (changed) {
            if (!lastSunShadowDirection) lastSunShadowDirection = new THREE.Vector3();
            lastSunShadowDirection.copy(direction);
            lastSunShadowRefresh = now;
            shadow.needsUpdate = true;
        }
        return changed;
    }

    function registerSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        if (!Canvas.gizmos.includes(object)) Canvas.gizmos.push(object);
    }

    function unregisterSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        const index = Canvas.gizmos.indexOf(object);
        if (index >= 0) Canvas.gizmos.splice(index, 1);
    }

    function pushSunShadowGizmoLine(vertices, a, b) {
        vertices.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }

    function getShadowFitBox() {
        return new THREE.Box3().setFromPoints(getShadowFitCorners());
    }

    function buildSunShadowGizmoVertices() {
        const size = getShadowFitBox().getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const x = Math.max(0.001, size.x);
        const y = Math.max(0.001, size.y);
        const z = Math.max(0.001, size.z);
        const vertices = [];
        const corners = [
            [-x, -y, -z], [x, -y, -z],
            [x, y, -z], [-x, y, -z],
            [-x, -y, z], [x, -y, z],
            [x, y, z], [-x, y, z]
        ];
        [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ].forEach(edge => pushSunShadowGizmoLine(vertices, corners[edge[0]], corners[edge[1]]));
        pushSunShadowGizmoLine(vertices, [-x, 0, 0], [x, 0, 0]);
        pushSunShadowGizmoLine(vertices, [0, -y, 0], [0, y, 0]);
        pushSunShadowGizmoLine(vertices, [0, 0, -z], [0, 0, z]);
        return vertices;
    }

    function makeSunShadowGizmoHandle(root, name, color, axis, sign) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        const handle = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), material);
        handle.name = `lightflow_environment_shadow_${name}`;
        handle.renderOrder = 1003;
        handle.userData.lightflowEnvironmentShadowHandle = { name, axis, sign };
        root.add(handle);
        return handle;
    }

    function createSunShadowGizmo() {
        if (!window.THREE || !window.Canvas?.scene || sunShadowGizmo) return sunShadowGizmo;
        const root = new THREE.Group();
        root.name = 'lightflow_environment_shadow_gizmo';
        root.renderOrder = 1001;
        root.raycast = () => { };

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xfff3c4,
            transparent: true,
            opacity: 0.38,
            depthTest: false,
            depthWrite: false
        });
        const line = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        line.name = 'lightflow_environment_shadow_area';
        line.raycast = () => { };
        root.add(line);

        const handles = {
            boundPX: makeSunShadowGizmoHandle(root, 'bound_px', 0xb55af8, 'x', 1),
            boundNX: makeSunShadowGizmoHandle(root, 'bound_nx', 0xb55af8, 'x', -1),
            boundPY: makeSunShadowGizmoHandle(root, 'bound_py', 0xb55af8, 'y', 1),
            boundNY: makeSunShadowGizmoHandle(root, 'bound_ny', 0xb55af8, 'y', -1),
            near: makeSunShadowGizmoHandle(root, 'near', 0xec9218, 'z', 1),
            far: makeSunShadowGizmoHandle(root, 'far', 0xfa565d, 'z', -1)
        };
        Canvas.scene.add(root);
        registerSunShadowCanvasGizmo(root);
        sunShadowGizmo = { root, line, lineMaterial, handles, signature: '' };
        return sunShadowGizmo;
    }

    function getSunShadowGizmoControlScale(localPosition) {
        const preview = window.Preview?.selected || window.main_preview;
        if (!preview || typeof preview.calculateControlScale !== 'function' || !sunShadowGizmo?.root) return 0.45;
        const worldPosition = localPosition.clone();
        sunShadowGizmo.root.localToWorld(worldPosition);
        return Math.max(0.08, preview.calculateControlScale(worldPosition) || 0.45) * 0.52;
    }

    function updateSunShadowGizmo() {
        const gizmo = createSunShadowGizmo();
        if (!gizmo || !sunLight || !sunTarget) return;
        const shouldShow = !!(
            settings.show_shadow_gizmo &&
            settings.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            settings.shadow_auto_fit &&
            (!window.Canvas || Canvas.show_gizmos !== false)
        );
        gizmo.root.visible = shouldShow;
        if (!shouldShow) return;

        const fitBox = getShadowFitBox();
        const center = fitBox.getCenter(new THREE.Vector3());
        const halfSize = fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        gizmo.root.position.copy(center);
        gizmo.root.quaternion.identity();
        gizmo.root.scale.setScalar(1);
        gizmo.lineMaterial.color.copy(sunLight.color);

        const signature = [
            fitBox.min.x, fitBox.min.y, fitBox.min.z,
            fitBox.max.x, fitBox.max.y, fitBox.max.z
        ].join('|');
        if (gizmo.signature !== signature) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(buildSunShadowGizmoVertices(), 3));
            gizmo.line.geometry.dispose();
            gizmo.line.geometry = geometry;
            gizmo.signature = signature;
        }

        const positions = {
            boundPX: new THREE.Vector3(halfSize.x, 0, 0),
            boundNX: new THREE.Vector3(-halfSize.x, 0, 0),
            boundPY: new THREE.Vector3(0, halfSize.y, 0),
            boundNY: new THREE.Vector3(0, -halfSize.y, 0),
            near: new THREE.Vector3(0, 0, halfSize.z),
            far: new THREE.Vector3(0, 0, -halfSize.z)
        };
        Object.keys(gizmo.handles).forEach(key => {
            const handle = gizmo.handles[key];
            handle.position.copy(positions[key]);
            handle.scale.setScalar(getSunShadowGizmoControlScale(positions[key]));
        });
    }

    function disposeSunShadowGizmo() {
        sunShadowGizmoDrag = null;
        sunShadowGizmoListeners.splice(0).forEach(listener => listener());
        if (!sunShadowGizmo) return;
        unregisterSunShadowCanvasGizmo(sunShadowGizmo.root);
        sunShadowGizmo.root.parent?.remove?.(sunShadowGizmo.root);
        sunShadowGizmo.root.traverse(object => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
            materials.forEach(material => material?.dispose?.());
        });
        sunShadowGizmo = null;
        sunShadowGizmoRaycaster = null;
        sunShadowGizmoMouse = null;
        effectiveShadowFrustum = null;
    }

    function getSunShadowGizmoPreview(event) {
        const target = event?.target;
        if (!target) return window.Preview?.selected || window.main_preview || null;
        const canvas = target.tagName === 'CANVAS'
            ? target
            : (typeof target.closest === 'function' ? target.closest('.preview canvas') : null);
        return (canvas && canvas.preview) || window.Preview?.selected || window.main_preview || null;
    }

    function setSunShadowGizmoRay(event, preview) {
        if (!preview?.canvas || !preview.camera) return null;
        sunShadowGizmoRaycaster = sunShadowGizmoRaycaster || new THREE.Raycaster();
        sunShadowGizmoMouse = sunShadowGizmoMouse || new THREE.Vector2();
        const rect = preview.canvas.getBoundingClientRect();
        sunShadowGizmoMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        sunShadowGizmoMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        sunShadowGizmoRaycaster.setFromCamera(sunShadowGizmoMouse, preview.camera);
        return sunShadowGizmoRaycaster.ray;
    }

    function projectSunShadowGizmoEvent(event, drag) {
        const ray = setSunShadowGizmoRay(event, drag.preview);
        if (!ray) return null;
        const point = new THREE.Vector3();
        return ray.intersectPlane(drag.plane, point) ? point : null;
    }

    function stopSunShadowGizmoEvent(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
    }

    function updateSunShadowGizmoDrag(event) {
        const drag = sunShadowGizmoDrag;
        if (!drag || !sunShadowGizmo?.root) return;
        const worldPoint = projectSunShadowGizmoEvent(event, drag);
        if (!worldPoint) return;
        const localPoint = drag.viewPosition && drag.inverseViewQuaternion
            ? worldPoint.clone().sub(drag.viewPosition).applyQuaternion(drag.inverseViewQuaternion)
            : sunShadowGizmo.root.worldToLocal(worldPoint.clone());
        const axis = drag.handle.axis;
        if (!['x', 'y', 'z'].includes(axis)) return;
        const halfSize = drag.startHalfSize.clone();
        halfSize[axis] = clamp(Math.abs(localPoint[axis]), 0.001, 100000);
        const min = drag.startCenter.clone().sub(halfSize);
        const max = drag.startCenter.clone().add(halfSize);
        const corners = getBoxWorldCorners(new THREE.Box3(min, max));
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flatMap(corner => corner.toArray())
        }, {
            cause: 'shadow_gizmo',
            forceShadow: false,
            syncPanel: false
        });
    }

    function installSunShadowGizmoInteraction() {
        if (typeof document === 'undefined' || sunShadowGizmoListeners.length) return;
        const onPointerDown = event => {
            if (event.button !== 0 || !sunShadowGizmo?.root?.visible || window.Canvas?.show_gizmos === false) return;
            const preview = getSunShadowGizmoPreview(event);
            if (!preview?.canvas || event.target !== preview.canvas) return;
            setSunShadowGizmoRay(event, preview);
            const handles = Object.values(sunShadowGizmo.handles).filter(handle => handle.visible !== false);
            const hit = sunShadowGizmoRaycaster.intersectObjects(handles, false)[0];
            const handle = hit?.object?.userData?.lightflowEnvironmentShadowHandle;
            if (!hit || !handle) return;
            const normal = new THREE.Vector3(0, 0, -1);
            preview.camera.getWorldDirection(normal);
            const fitBox = getShadowFitBox();
            sunShadowGizmoDrag = {
                handle,
                preview,
                plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
                viewPosition: sunShadowGizmo.root.position.clone(),
                viewQuaternion: sunShadowGizmo.root.quaternion.clone(),
                inverseViewQuaternion: sunShadowGizmo.root.quaternion.clone().invert(),
                startCenter: fitBox.getCenter(new THREE.Vector3()),
                startHalfSize: fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
                original: {
                    shadow_auto_fit: settings.shadow_auto_fit,
                    shadow_fit_corners: Array.isArray(settings.shadow_fit_corners)
                        ? settings.shadow_fit_corners.slice()
                        : null
                }
            };
            stopSunShadowGizmoEvent(event);
        };
        const onPointerMove = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            updateSunShadowGizmoDrag(event);
        };
        const onPointerUp = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            sunShadowGizmoDrag = null;
        };
        const onKeyDown = event => {
            if (!sunShadowGizmoDrag || event.key !== 'Escape') return;
            const original = sunShadowGizmoDrag.original;
            sunShadowGizmoDrag = null;
            stopSunShadowGizmoEvent(event);
            applySettings(original, {
                cause: 'shadow_gizmo_cancel',
                forceShadow: false,
                captureShadowFitRegion: false
            });
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('keydown', onKeyDown, true);
        sunShadowGizmoListeners.push(
            () => document.removeEventListener('pointerdown', onPointerDown, true),
            () => document.removeEventListener('pointermove', onPointerMove, true),
            () => document.removeEventListener('pointerup', onPointerUp, true),
            () => document.removeEventListener('keydown', onKeyDown, true)
        );
    }

    function setColor(target, value) {
        target?.setRGB?.(value[0], value[1], value[2]);
    }

    function updateScene(options = {}) {
        if (!window.THREE || !window.Canvas?.scene) return;
        createSky();
        createSunLight();
        ensureSunLightParent();
        ensureSkyTextures();
        const state = getLightingState();
        const preset = getPalette();

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
            skyMaterial.uniforms.uSkyGradientPower.value = settings.sky_gradient_power;
            skyMaterial.uniforms.uStarDensity.value = settings.star_density;
            const sunTexture = getBlockbenchTextureMap(settings.sun_texture_uuid);
            const moonTexture = getBlockbenchTextureMap(settings.moon_texture_uuid);
            const customCloudTexture = getBlockbenchTextureMap(settings.cloud_texture_uuid);
            skyMaterial.uniforms.uSunMode.value = settings.sun_mode === 'hidden'
                ? 2
                : (settings.sun_mode === 'texture' && sunTexture ? 1 : 0);
            skyMaterial.uniforms.uMoonMode.value = settings.moon_mode === 'hidden'
                ? 2
                : (settings.moon_mode === 'texture' && moonTexture ? 1 : 0);
            skyMaterial.uniforms.uCloudMode.value = settings.cloud_mode === 'procedural' ? 0 : 1;
            skyMaterial.uniforms.uSunTexture.value = sunTexture || fallbackTexture;
            skyMaterial.uniforms.uMoonTexture.value = moonTexture || fallbackTexture;
            skyMaterial.uniforms.uCloudTexture.value = settings.cloud_mode === 'texture' && customCloudTexture
                ? customCloudTexture
                : (vanillaCloudTexture || fallbackTexture);
            skyMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
            skyMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
            skyMaterial.uniforms.uCloudContrast.value = settings.cloud_contrast;
            skyMaterial.uniforms.uCloudBrightness.value = settings.cloud_brightness;
        }

        let shadowChanged = false;
        if (sunLight) {
            const activeSun = !!(settings.enabled && settings.sun_enabled && state.sunIntensity > 0.0001);
            // Keep the directional light in Three's light list. Toggling
            // Object3D.visible changes NUM_DIR_LIGHTS and recompiles every
            // material; intensity zero is visually identical without the
            // shader-program hitch.
            sunLight.visible = true;
            sunLight.intensity = activeSun ? state.sunIntensity : 0;
            setColor(sunLight.color, state.sunColor);
            updateSunShadowPlacement(state.celestialDirection);
            shadowChanged = configureSunShadow(!!options.forceShadow, {
                animation: !!options.animation,
                state
            });
            sunLight.updateMatrixWorld(true);
            sunTarget.updateMatrixWorld(true);
            const frustum = getActiveShadowFrustum();
            const gizmoSignature = [
                settings.show_shadow_gizmo ? 1 : 0,
                settings.enabled ? 1 : 0,
                settings.sun_enabled ? 1 : 0,
                settings.sun_cast_shadows ? 1 : 0,
                settings.shadow_auto_fit ? 1 : 0,
                frustum.area,
                frustum.near,
                frustum.far,
                Array.isArray(settings.shadow_fit_corners) ? settings.shadow_fit_corners.join(',') : ''
            ].join('|');
            if (gizmoSignature !== lastSunShadowGizmoSignature) {
                lastSunShadowGizmoSignature = gizmoSignature;
                updateSunShadowGizmo();
            }
        }

        if (window.ShaderEngine) {
            window.ShaderEngine.environmentState = state;
            if (typeof window.ShaderEngine.requestLightUniformUpdate === 'function') {
                window.ShaderEngine.requestLightUniformUpdate('environment_update', { render: false });
            } else {
                window.ShaderEngine.updateLightUniforms?.('environment_update', { render: false });
            }
        }
        if (shadowChanged && typeof window.LightManagerMarkShadowsDirty === 'function') {
            window.LightManagerMarkShadowsDirty({ scene: !!options.forceShadow });
        }
        if (shadowChanged && typeof window.LightManagerPrepareRender === 'function') {
            const preview = window.Preview?.selected || window.main_preview || window.MediaPreview || null;
            window.LightManagerPrepareRender(preview, { force: !!options.forceShadow });
        }
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (previewRenderFrame !== null) return;
        const revision = environmentRevision;
        const project = window.Project || null;
        const render = () => {
            previewRenderFrame = null;
            if (window.LightManagerStudioRenderSession) return;
            if (
                revision !== environmentRevision ||
                project !== environmentProject ||
                project !== (window.Project || null)
            ) return;
            const preview = window.Preview?.selected || window.main_preview || window.MediaPreview;
            preview?.render?.();
        };
        if (typeof requestAnimationFrame === 'function') previewRenderFrame = requestAnimationFrame(render);
        else {
            previewRenderFrame = 'microtask';
            queueMicrotask(render);
        }
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

    function syncEnvironmentPanel(options = {}) {
        if (!environmentPanel?.form || syncingEnvironmentPanel) return;
        const controls = environmentPanel.form.form_data;
        if (!controls) return;
        syncingEnvironmentPanel = true;
        try {
            controls.time?.setValue?.(settings.time);
            if (options.timeOnly) return;
            controls.enabled?.setValue?.(settings.enabled);
            controls.preset?.setValue?.(settings.preset);
            controls.animate_time?.setValue?.(settings.animate_time);
            controls.sky_intensity?.setValue?.(settings.sky_intensity);
            controls.environment_strength?.setValue?.(settings.environment_strength);
            controls.cloud_mode?.setValue?.(settings.cloud_mode);
        } finally {
            syncingEnvironmentPanel = false;
        }
        environmentPanel.form.update();
    }

    function applySettings(next, options = {}) {
        const incoming = next || {};
        const frustumKeys = ['shadow_area', 'shadow_near', 'shadow_far'];
        const hasFrustumEdit = frustumKeys.some(key => Object.prototype.hasOwnProperty.call(incoming, key));
        const shouldCaptureFitRegion = hasFrustumEdit && (
            options.captureShadowFitRegion === true ||
            (
                options.captureShadowFitRegion !== false &&
                options.cause !== 'dialog_preview' &&
                options.cause !== 'dialog_confirm'
            )
        );
        const activeFrustum = getActiveShadowFrustum();
        const manualFrustum = {
            area: Object.prototype.hasOwnProperty.call(incoming, 'shadow_area') ? incoming.shadow_area : activeFrustum.area,
            near: Object.prototype.hasOwnProperty.call(incoming, 'shadow_near') ? incoming.shadow_near : activeFrustum.near,
            far: Object.prototype.hasOwnProperty.call(incoming, 'shadow_far') ? incoming.shadow_far : activeFrustum.far
        };
        const merged = Object.assign({}, settings, incoming);
        if (shouldCaptureFitRegion) {
            merged.shadow_area = manualFrustum.area;
            merged.shadow_near = manualFrustum.near;
            merged.shadow_far = manualFrustum.far;
        }
        settings = normalizeSettings(merged);
        if (shouldCaptureFitRegion) captureShadowFitRegion(manualFrustum);
        saveSettings();
        if (options.syncPanel !== false) syncEnvironmentPanel();
        updateScene({
            forceShadow: options.forceShadow === true,
            animation: !!options.animation
        });
        dispatchChanged(options.cause || 'settings');
        if (options.render !== false) requestPreviewRender();
        return Object.assign({}, settings);
    }

    function applyPreset(presetId, options = {}) {
        const preset = PRESETS[presetId] ? presetId : 'vanilla';
        const vibrant = preset === 'vibrant_visuals';
        return applySettings({
            preset,
            palette_mode: 'preset',
            sky_intensity: vibrant ? 1.08 : 1,
            environment_strength: vibrant ? 0.92 : 0.75,
            sun_intensity: vibrant ? 2.8 : 2.2,
            shadow_resolution: vibrant ? 2048 : settings.shadow_resolution,
            pixelated_shadows: vibrant,
            pixel_shadow_steps: vibrant ? 4 : settings.pixel_shadow_steps,
            pixel_shadow_scale: vibrant ? 2 : settings.pixel_shadow_scale,
            cloud_coverage: vibrant ? 0.5 : 0.54,
            cloud_opacity: vibrant ? 0.86 : 0.78,
            cloud_mode: 'vanilla',
            sun_mode: 'vanilla',
            moon_mode: 'vanilla'
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

    function collectEnvironmentSceneFitTargets(fitTool) {
        const targets = [];
        const seen = new Set();
        const roots = Array.isArray(window.Outliner?.root) && Outliner.root.length
            ? Outliner.root
            : (Array.isArray(window.Outliner?.elements) ? Outliner.elements : []);
        roots.forEach(node => fitTool.addTargetNode(node, targets, seen));
        return targets;
    }

    function getEnvironmentShadowFitSource() {
        const fitTool = window.LightManagerFitTool;
        if (!fitTool) return null;

        const selectedTargets = fitTool.getSelectedTargets();
        const selectedPoints = fitTool.collectTargetPoints(selectedTargets);
        if (selectedTargets.length && selectedPoints.length) {
            return { targets: selectedTargets, points: selectedPoints, mode: 'selection' };
        }

        const sceneTargets = collectEnvironmentSceneFitTargets(fitTool);
        const scenePoints = fitTool.collectTargetPoints(sceneTargets);
        if (!sceneTargets.length || !scenePoints.length) return null;
        return { targets: sceneTargets, points: scenePoints, mode: 'scene' };
    }

    function fitEnvironmentShadowRegion() {
        const source = getEnvironmentShadowFitSource();
        if (!source) {
            Blockbench.showQuickMessage(tr(
                'lightflow_environment.message.fit_no_geometry',
                'No geometry is available to fit the environment shadow region.'
            ));
            return false;
        }

        const box = window.LightManagerFitTool.getPointsBox(source.points);
        if (!box || box.isEmpty()) return false;
        const size = box.getSize(new THREE.Vector3());
        const margin = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.015);
        box.expandByScalar(margin);
        const min = box.min;
        const max = box.max;
        const corners = [
            [min.x, min.y, min.z], [max.x, min.y, min.z],
            [max.x, max.y, min.z], [min.x, max.y, min.z],
            [min.x, min.y, max.z], [max.x, min.y, max.z],
            [max.x, max.y, max.z], [min.x, max.y, max.z]
        ];
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flat()
        }, {
            cause: 'fit_shadow_region',
            forceShadow: false,
            syncPanel: true
        });

        const messageKey = source.mode === 'selection'
            ? 'lightflow_environment.message.fit_selection'
            : 'lightflow_environment.message.fit_scene';
        const fallback = source.mode === 'selection'
            ? 'Environment shadows fitted to the selected geometry.'
            : 'Environment shadows fitted to all scene geometry.';
        Blockbench.showQuickMessage(tr(messageKey, fallback));
        return true;
    }

    function createDialogForm() {
        const textureOptions = getTextureOptions();
        const shadowFrustum = getActiveShadowFrustum();
        return {
            preset: { type: 'select', label: 'lightflow_environment.field.preset', value: settings.preset,
                options: { vanilla: 'Minecraft Vanilla', vibrant_visuals: 'Minecraft Vibrant Visuals' } },
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            _time: '_',
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100 },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            day_length_seconds: { type: 'number', label: 'lightflow_environment.field.day_length', value: settings.day_length_seconds, min: 10, max: 3600, step: 10, condition: form => !!form.animate_time },
            sun_azimuth: { type: 'range', label: 'lightflow_environment.field.azimuth', value: settings.sun_azimuth, min: 0, max: 360, step: 1 },
            _sky_colors: '_',
            palette_mode: { type: 'select', label: 'lightflow_environment.field.palette_mode', value: settings.palette_mode,
                options: { preset: 'lightflow_environment.option.palette_preset', custom: 'lightflow_environment.option.palette_custom' } },
            zenith_color: { type: 'color', label: 'lightflow_environment.field.zenith_color', value: settings.zenith_color, condition: form => form.palette_mode === 'custom' },
            horizon_color: { type: 'color', label: 'lightflow_environment.field.horizon_color', value: settings.horizon_color, condition: form => form.palette_mode === 'custom' },
            sunrise_zenith_color: { type: 'color', label: 'lightflow_environment.field.sunrise_zenith_color', value: settings.sunrise_zenith_color, condition: form => form.palette_mode === 'custom' },
            sunrise_horizon_color: { type: 'color', label: 'lightflow_environment.field.sunrise_horizon_color', value: settings.sunrise_horizon_color, condition: form => form.palette_mode === 'custom' },
            night_zenith_color: { type: 'color', label: 'lightflow_environment.field.night_zenith_color', value: settings.night_zenith_color, condition: form => form.palette_mode === 'custom' },
            night_horizon_color: { type: 'color', label: 'lightflow_environment.field.night_horizon_color', value: settings.night_horizon_color, condition: form => form.palette_mode === 'custom' },
            ground_color: { type: 'color', label: 'lightflow_environment.field.ground_color', value: settings.ground_color, condition: form => form.palette_mode === 'custom' },
            sun_color: { type: 'color', label: 'lightflow_environment.field.sun_color', value: settings.sun_color, condition: form => form.palette_mode === 'custom' },
            moon_color: { type: 'color', label: 'lightflow_environment.field.moon_color', value: settings.moon_color, condition: form => form.palette_mode === 'custom' },
            cloud_color: { type: 'color', label: 'lightflow_environment.field.cloud_color', value: settings.cloud_color, condition: form => form.palette_mode === 'custom' },
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            sky_gradient_power: { type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power, min: 0.5, max: 8, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            _celestial: '_',
            sun_enabled: { type: 'checkbox', label: 'lightflow_environment.field.sun_enabled', value: settings.sun_enabled },
            sun_intensity: { type: 'range', label: 'lightflow_environment.field.sun_intensity', value: settings.sun_intensity, min: 0, max: 10, step: 0.05, condition: form => !!form.sun_enabled },
            moon_intensity: { type: 'range', label: 'lightflow_environment.field.moon_intensity', value: settings.moon_intensity, min: 0, max: 2, step: 0.02, condition: form => !!form.sun_enabled },
            celestial_size: { type: 'range', label: 'lightflow_environment.field.celestial_size', value: settings.celestial_size, min: 0.012, max: 0.18, step: 0.002 },
            moon_phase: { type: 'range', label: 'lightflow_environment.field.moon_phase', value: settings.moon_phase, min: 0, max: 7, step: 1 },
            sun_mode: { type: 'select', label: 'lightflow_environment.field.sun_mode', value: settings.sun_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            sun_texture_uuid: { type: 'select', label: 'lightflow_environment.field.sun_texture', value: settings.sun_texture_uuid,
                options: textureOptions, condition: form => form.sun_mode === 'texture' },
            moon_mode: { type: 'select', label: 'lightflow_environment.field.moon_mode', value: settings.moon_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            moon_texture_uuid: { type: 'select', label: 'lightflow_environment.field.moon_texture', value: settings.moon_texture_uuid,
                options: textureOptions, condition: form => form.moon_mode === 'texture' },
            _sky: '_',
            stars_enabled: { type: 'checkbox', label: 'lightflow_environment.field.stars', value: settings.stars_enabled },
            star_brightness: { type: 'range', label: 'lightflow_environment.field.star_brightness', value: settings.star_brightness, min: 0, max: 3, step: 0.05, condition: form => !!form.stars_enabled },
            star_density: { type: 'range', label: 'lightflow_environment.field.star_density', value: settings.star_density, min: 0.1, max: 4, step: 0.05, condition: form => !!form.stars_enabled },
            clouds_enabled: { type: 'checkbox', label: 'lightflow_environment.field.clouds', value: settings.clouds_enabled },
            cloud_mode: { type: 'select', label: 'lightflow_environment.field.cloud_mode', value: settings.cloud_mode,
                options: { procedural: 'lightflow_environment.option.cloud_procedural', vanilla: 'lightflow_environment.option.cloud_vanilla', texture: 'lightflow_environment.option.cloud_texture' }, condition: form => !!form.clouds_enabled },
            cloud_texture_uuid: { type: 'select', label: 'lightflow_environment.field.cloud_texture', value: settings.cloud_texture_uuid,
                options: textureOptions, condition: form => !!form.clouds_enabled && form.cloud_mode === 'texture' },
            cloud_coverage: { type: 'range', label: 'lightflow_environment.field.cloud_coverage', value: settings.cloud_coverage, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_opacity: { type: 'range', label: 'lightflow_environment.field.cloud_opacity', value: settings.cloud_opacity, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_speed: { type: 'range', label: 'lightflow_environment.field.cloud_speed', value: settings.cloud_speed, min: -0.2, max: 0.2, step: 0.002, condition: form => !!form.clouds_enabled },
            cloud_scale: { type: 'range', label: 'lightflow_environment.field.cloud_scale', value: settings.cloud_scale, min: 0.05, max: 16, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_direction: { type: 'range', label: 'lightflow_environment.field.cloud_direction', value: settings.cloud_direction, min: 0, max: 360, step: 1, condition: form => !!form.clouds_enabled },
            cloud_contrast: { type: 'range', label: 'lightflow_environment.field.cloud_contrast', value: settings.cloud_contrast, min: 0.1, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_brightness: { type: 'range', label: 'lightflow_environment.field.cloud_brightness', value: settings.cloud_brightness, min: 0, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            _shadows: '_',
            sun_cast_shadows: { type: 'checkbox', label: 'lightflow_environment.field.cast_shadows', value: settings.sun_cast_shadows, condition: form => !!form.sun_enabled },
            fit_shadow_region: {
                type: 'buttons',
                buttons: ['lightflow_environment.action.fit_shadow_region'],
                click: fitEnvironmentShadowRegion,
                condition: form => !!form.sun_cast_shadows
            },
            shadow_auto_fit: { type: 'checkbox', label: 'lightflow_environment.field.shadow_auto_fit', value: settings.shadow_auto_fit, condition: form => !!form.sun_cast_shadows },
            show_shadow_gizmo: { type: 'checkbox', label: 'lightflow_environment.field.show_shadow_gizmo', value: settings.show_shadow_gizmo, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            shadow_area: { type: 'number', label: 'lightflow_environment.field.shadow_area', value: shadowFrustum.area, min: 2, max: 100000, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_resolution: { type: 'select', label: 'lightflow_environment.field.shadow_resolution', value: String(settings.shadow_resolution),
                options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096', '8192': '8192' }, condition: form => !!form.sun_cast_shadows },
            shadow_near: { type: 'number', label: 'lightflow_environment.field.shadow_near', value: shadowFrustum.near, min: 0.001, step: 0.1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_far: { type: 'number', label: 'lightflow_environment.field.shadow_far', value: shadowFrustum.far, min: 2, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_bias: { type: 'number', label: 'lightflow_environment.field.shadow_bias', value: settings.shadow_bias, min: -0.1, max: 0.1, step: 0.00005, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias: { type: 'number', label: 'lightflow_environment.field.normal_bias', value: settings.shadow_normal_bias, min: 0, max: 2, step: 0.005, condition: form => !!form.sun_cast_shadows },
            pixelated_shadows: { type: 'checkbox', label: 'lightflow_environment.field.pixelated_shadows', value: settings.pixelated_shadows, condition: form => !!form.sun_cast_shadows },
            pixel_shadow_steps: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_steps', value: settings.pixel_shadow_steps, min: 2, max: 16, step: 1, condition: form => !!form.pixelated_shadows },
            pixel_shadow_scale: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_scale', value: settings.pixel_shadow_scale, min: 1, max: 16, step: 1, condition: form => !!form.pixelated_shadows }
        };
    }

    function createPanelForm() {
        return {
            enabled: {
                type: 'action_toggle', value: settings.enabled, description: 'lightflow_environment.field.enabled',
                icon_on: 'public', icon_off: 'public_off', bg_on: markerColor(0, 'standard', '#58C0FF'),
                color_on: 'var(--color-ui)', color_off: 'var(--color-subtle_text)', icon_size: '22px'
            },
            preset: {
                type: 'compact_select', label: 'lightflow_environment.field.preset', hide_label: true,
                description: 'lightflow_environment.field.preset', background: 'transparent', value: settings.preset,
                options: {
                    vanilla: { name: 'Minecraft Vanilla', icon: 'landscape', color: markerColor(0, 'pastel', '#A2EBFF') },
                    vibrant_visuals: { name: 'Minecraft Vibrant Visuals', icon: 'auto_awesome', color: markerColor(1, 'pastel', '#FFF899') }
                }
            },
            animate_time: {
                type: 'action_toggle', value: settings.animate_time, description: 'lightflow_environment.field.animate',
                icon_on: 'pause_circle', icon_off: 'play_circle', bg_on: markerColor(6, 'standard', '#00CE71'),
                color_on: 'var(--color-ui)', color_off: markerColor(6, 'pastel', '#7BFFA3')
            },
            panel_advanced: {
                type: 'action_button', icon: 'tune', description: 'lightflow_environment.action.open',
                color: markerColor(4, 'pastel', '#C5A6E8'), click: openSettingsDialog
            },
            fit_shadow_region: {
                type: 'action_button', icon: 'center_focus_strong',
                description: 'lightflow_environment.action.fit_shadow_region.desc',
                color: markerColor(4, 'pastel', '#C5A6E8'), click: fitEnvironmentShadowRegion
            },
            time: {
                type: 'combo_slider', label: 'lightflow_environment.field.time', icon: 'schedule',
                color: markerColor(1, 'pastel', '#FFF899'), value: settings.time,
                resettable: true, reset_value: DEFAULT_SETTINGS.time, min: 0, max: 23999, step: 100
            },
            sky_label: {
                type: 'bar_display', icon: 'wb_twilight', paragraph: false, expand: false,
                color: 'var(--color-subtle_text)', description: 'lightflow_environment.field.sky_intensity'
            },
            sky_intensity: {
                type: 'combo_slider', label: 'lightflow_environment.field.sky_intensity', icon: 'wb_sunny',
                background: 'transparent', color: markerColor(2, 'pastel', '#F1BB75'),
                icon_color: markerColor(2, 'pastel', '#F1BB75'), compact: true, popup_width: '300px',
                value: settings.sky_intensity, resettable: true, reset_value: DEFAULT_SETTINGS.sky_intensity,
                min: 0, max: 4, step: 0.05
            },
            environment_strength: {
                type: 'combo_slider', label: 'lightflow_environment.field.environment', icon: 'language',
                background: 'transparent', color: markerColor(6, 'pastel', '#7BFFA3'),
                icon_color: markerColor(6, 'pastel', '#7BFFA3'), compact: true, popup_width: '300px',
                value: settings.environment_strength, resettable: true, reset_value: DEFAULT_SETTINGS.environment_strength,
                min: 0, max: 4, step: 0.05
            },
            cloud_mode: {
                type: 'compact_select', label: 'lightflow_environment.field.cloud_mode', hide_label: true,
                description: 'lightflow_environment.field.cloud_mode', background: 'transparent', value: settings.cloud_mode,
                options: {
                    procedural: { name: 'lightflow_environment.option.cloud_procedural', icon: 'grain', color: markerColor(9, 'pastel', '#E0E9FB') },
                    vanilla: { name: 'lightflow_environment.option.cloud_vanilla', icon: 'cloud', color: markerColor(0, 'pastel', '#A2EBFF') },
                    texture: { name: 'lightflow_environment.option.cloud_texture', icon: 'texture', color: markerColor(8, 'pastel', '#FFA5D5') }
                }
            }
        };
    }

    function openSettingsDialog() {
        const formConfig = createDialogForm();
        let previousShadowFrustum = {
            shadow_area: formConfig.shadow_area.value,
            shadow_near: formConfig.shadow_near.value,
            shadow_far: formConfig.shadow_far.value
        };
        const applyDialogSettings = (form, options) => {
            const shadowFrustumChanged = ['shadow_area', 'shadow_near', 'shadow_far'].some(key => (
                Math.abs(finite(form[key], previousShadowFrustum[key]) - finite(previousShadowFrustum[key], 0)) > 1e-6
            ));
            previousShadowFrustum = {
                shadow_area: form.shadow_area,
                shadow_near: form.shadow_near,
                shadow_far: form.shadow_far
            };
            applySettings(form, { ...options, captureShadowFitRegion: shadowFrustumChanged });
        };
        new Dialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 720,
            form: formConfig,
            onFormChange(form) {
                applyDialogSettings(form, { cause: 'dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                applyDialogSettings(form, { cause: 'dialog_confirm', forceShadow: true, syncPanel: true });
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
        environmentPanel = new Panel('lightflow_environment_panel', {
            name: 'lightflow_environment.panel.title',
            icon: 'wb_twilight',
            growable: true,
            resizable: true,
            expand_button: true,
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [314, 200], height: 200,
                folded: false, attached_to: 'outliner', attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                render: {
                    slot: 'right_bar', height: 200, folded: false,
                    attached_to: 'outliner', attached_index: 1, sidebar_index: 1
                }
            },
            insert_after: 'outliner',
            form: createPanelForm()
        });
        environmentPanel.form.on('change', ({ result }) => {
            if (syncingEnvironmentPanel) return;
            const panelResult = {};
            ['enabled', 'preset', 'time', 'animate_time', 'sky_intensity', 'environment_strength', 'cloud_mode'].forEach(key => {
                if (result && Object.prototype.hasOwnProperty.call(result, key)) panelResult[key] = result[key];
            });
            applySettings(panelResult, { cause: 'environment_panel', forceShadow: false, syncPanel: false });
        });
        window.applyIndestructibleFormGroups(environmentPanel.form, [
            {
                elements: ['enabled', 'preset', '+', 'animate_time', 'fit_shadow_region', 'panel_advanced'], gap: '2px',
                divider_color: 'var(--color-grid)',
                flex: { enabled: '0 0 auto', preset: '0 0 auto', animate_time: '0 0 auto', fit_shadow_region: '0 0 auto', panel_advanced: '0 0 auto' }
            },
            { elements: ['time'], gap: '2px', flex: { time: '1 1 100%' } },
            {
                elements: ['sky_label', 'sky_intensity', 'environment_strength', 'cloud_mode'], gap: '2px',
                flex: { sky_label: '0 0 auto', sky_intensity: '0 0 auto', environment_strength: '0 0 auto', cloud_mode: '0 0 auto' }
            }
        ]);
        const panelStyles = window.LightManagerUI.addCompactPanelStyles('lightflow_environment_panel');
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, environmentPanel, panelStyles);
        syncEnvironmentPanel();
    }

    function installTranslations() {
        const translations = {
            'lightflow_environment.plugin.title': 'Lightflow Environment',
            'lightflow_environment.panel.title': 'ENVIRONMENT',
            'lightflow_environment.action.open': 'Environment Composer...',
            'lightflow_environment.action.open.desc': 'Compose a Minecraft sky, time, sun, moon, clouds, ambient response, and directional shadows',
            'lightflow_environment.action.fit_shadow_region': 'Fit Shadow Region to Selection / Scene',
            'lightflow_environment.action.fit_shadow_region.desc': 'Fit environment shadows to selected geometry, or to all scene geometry when nothing is selected',
            'lightflow_environment.dialog.title': 'Minecraft Environment Composer',
            'lightflow_environment.field.preset': 'Sky Model',
            'lightflow_environment.field.enabled': 'Render Environment',
            'lightflow_environment.field.time': 'Minecraft Time',
            'lightflow_environment.field.animate': 'Animate Day Cycle',
            'lightflow_environment.field.day_length': 'Full Day Length (seconds)',
            'lightflow_environment.field.azimuth': 'Sun Path Rotation',
            'lightflow_environment.field.palette_mode': 'Sky Color Source',
            'lightflow_environment.option.palette_preset': 'Use Preset Palette',
            'lightflow_environment.option.palette_custom': 'Custom Palette',
            'lightflow_environment.field.zenith_color': 'Day Zenith',
            'lightflow_environment.field.horizon_color': 'Day Horizon',
            'lightflow_environment.field.sunrise_zenith_color': 'Sunrise Zenith',
            'lightflow_environment.field.sunrise_horizon_color': 'Sunrise Horizon',
            'lightflow_environment.field.night_zenith_color': 'Night Zenith',
            'lightflow_environment.field.night_horizon_color': 'Night Horizon',
            'lightflow_environment.field.ground_color': 'Lower Sky / Ground',
            'lightflow_environment.field.sun_color': 'Sun Color',
            'lightflow_environment.field.moon_color': 'Moon Color',
            'lightflow_environment.field.cloud_color': 'Cloud Color',
            'lightflow_environment.field.sky_intensity': 'Sky Brightness',
            'lightflow_environment.field.gradient_power': 'Sky Gradient Shape',
            'lightflow_environment.field.environment': 'Environment Influence',
            'lightflow_environment.field.sun_enabled': 'Sun / Moon Light',
            'lightflow_environment.field.sun_intensity': 'Sun Intensity',
            'lightflow_environment.field.moon_intensity': 'Moon Intensity',
            'lightflow_environment.field.celestial_size': 'Sun / Moon Size',
            'lightflow_environment.field.moon_phase': 'Moon Phase',
            'lightflow_environment.field.sun_mode': 'Sun Appearance',
            'lightflow_environment.field.moon_mode': 'Moon Appearance',
            'lightflow_environment.field.sun_texture': 'Sun Project Texture',
            'lightflow_environment.field.moon_texture': 'Moon Project Texture',
            'lightflow_environment.option.celestial_vanilla': 'Vanilla-style Square',
            'lightflow_environment.option.celestial_texture': 'Project Texture',
            'lightflow_environment.option.hidden': 'Hidden',
            'lightflow_environment.option.texture_none': 'Select a project texture',
            'lightflow_environment.field.stars': 'Stars',
            'lightflow_environment.field.star_brightness': 'Star Brightness',
            'lightflow_environment.field.star_density': 'Star Density',
            'lightflow_environment.field.clouds': 'Minecraft Clouds',
            'lightflow_environment.field.cloud_mode': 'Cloud Source',
            'lightflow_environment.field.cloud_texture': 'Cloud Project Texture',
            'lightflow_environment.option.cloud_procedural': 'Procedural Blocks',
            'lightflow_environment.option.cloud_vanilla': 'Generated Vanilla-style Texture',
            'lightflow_environment.option.cloud_texture': 'Project Texture',
            'lightflow_environment.field.cloud_coverage': 'Cloud Coverage',
            'lightflow_environment.field.cloud_opacity': 'Cloud Opacity',
            'lightflow_environment.field.cloud_speed': 'Cloud Speed',
            'lightflow_environment.field.cloud_scale': 'Cloud Scale',
            'lightflow_environment.field.cloud_direction': 'Cloud Direction',
            'lightflow_environment.field.cloud_contrast': 'Cloud Contrast',
            'lightflow_environment.field.cloud_brightness': 'Cloud Brightness',
            'lightflow_environment.field.cast_shadows': 'Sun Cast Shadows',
            'lightflow_environment.field.shadow_auto_fit': 'Fixed World Shadow Coverage Box',
            'lightflow_environment.field.show_shadow_gizmo': 'Show Editable Fixed Shadow Box',
            'lightflow_environment.field.shadow_area': 'Shadow Capture Area',
            'lightflow_environment.field.shadow_resolution': 'Shadow Resolution',
            'lightflow_environment.field.shadow_near': 'Shadow Near Plane',
            'lightflow_environment.field.shadow_far': 'Shadow Far Plane',
            'lightflow_environment.field.shadow_bias': 'Shadow Bias',
            'lightflow_environment.field.normal_bias': 'Shadow Normal Bias',
            'lightflow_environment.field.pixelated_shadows': 'Vibrant Visuals Pixel Shadows',
            'lightflow_environment.field.pixel_shadow_steps': 'Shadow Tone Steps',
            'lightflow_environment.field.pixel_shadow_scale': 'Shadow Pixel Size',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requires Light Manager.',
            'lightflow_environment.message.fit_selection': 'Environment shadows fitted to the selected geometry.',
            'lightflow_environment.message.fit_scene': 'Environment shadows fitted to all scene geometry.',
            'lightflow_environment.message.fit_no_geometry': 'No geometry is available to fit the environment shadow region.'
        };
        Language.addTranslations('en', translations);
        Language.addTranslations('es', Object.assign({}, translations, {
            'lightflow_environment.plugin.title': 'Entorno Lightflow',
            'lightflow_environment.panel.title': 'ENTORNO',
            'lightflow_environment.action.open': 'Compositor de entorno...',
            'lightflow_environment.action.fit_shadow_region': 'Ajustar región de sombras a selección / escena',
            'lightflow_environment.action.fit_shadow_region.desc': 'Ajusta las sombras a la geometría seleccionada o a toda la escena cuando no hay selección',
            'lightflow_environment.dialog.title': 'Compositor de entorno Minecraft',
            'lightflow_environment.field.preset': 'Modelo de cielo',
            'lightflow_environment.field.enabled': 'Renderizar entorno',
            'lightflow_environment.field.time': 'Hora de Minecraft',
            'lightflow_environment.field.animate': 'Animar ciclo del día',
            'lightflow_environment.field.palette_mode': 'Origen de colores del cielo',
            'lightflow_environment.option.palette_preset': 'Usar paleta del preset',
            'lightflow_environment.option.palette_custom': 'Paleta personalizada',
            'lightflow_environment.field.zenith_color': 'Cénit diurno',
            'lightflow_environment.field.horizon_color': 'Horizonte diurno',
            'lightflow_environment.field.sunrise_zenith_color': 'Cénit del amanecer',
            'lightflow_environment.field.sunrise_horizon_color': 'Horizonte del amanecer',
            'lightflow_environment.field.night_zenith_color': 'Cénit nocturno',
            'lightflow_environment.field.night_horizon_color': 'Horizonte nocturno',
            'lightflow_environment.field.ground_color': 'Cielo inferior / suelo',
            'lightflow_environment.field.sun_color': 'Color del sol',
            'lightflow_environment.field.moon_color': 'Color de la luna',
            'lightflow_environment.field.cloud_color': 'Color de las nubes',
            'lightflow_environment.field.gradient_power': 'Forma del gradiente del cielo',
            'lightflow_environment.field.environment': 'Influencia del entorno',
            'lightflow_environment.field.sun_mode': 'Apariencia del sol',
            'lightflow_environment.field.moon_mode': 'Apariencia de la luna',
            'lightflow_environment.field.sun_texture': 'Textura del proyecto para el sol',
            'lightflow_environment.field.moon_texture': 'Textura del proyecto para la luna',
            'lightflow_environment.option.celestial_vanilla': 'Cuadrado estilo Vanilla',
            'lightflow_environment.option.celestial_texture': 'Textura del proyecto',
            'lightflow_environment.option.hidden': 'Oculto',
            'lightflow_environment.option.texture_none': 'Selecciona una textura del proyecto',
            'lightflow_environment.field.star_density': 'Densidad de estrellas',
            'lightflow_environment.field.cloud_mode': 'Origen de las nubes',
            'lightflow_environment.field.cloud_texture': 'Textura del proyecto para nubes',
            'lightflow_environment.option.cloud_procedural': 'Bloques procedurales',
            'lightflow_environment.option.cloud_vanilla': 'Textura estilo Vanilla generada',
            'lightflow_environment.option.cloud_texture': 'Textura del proyecto',
            'lightflow_environment.field.cloud_scale': 'Escala de nubes',
            'lightflow_environment.field.cloud_direction': 'Dirección de nubes',
            'lightflow_environment.field.cloud_contrast': 'Contraste de nubes',
            'lightflow_environment.field.cloud_brightness': 'Brillo de nubes',
            'lightflow_environment.field.cast_shadows': 'El sol proyecta sombras',
            'lightflow_environment.field.shadow_auto_fit': 'Caja fija mundial de cobertura de sombras',
            'lightflow_environment.field.show_shadow_gizmo': 'Mostrar caja fija de sombras editable',
            'lightflow_environment.field.shadow_area': 'Área de captura de sombras',
            'lightflow_environment.field.pixelated_shadows': 'Sombras pixeladas Vibrant Visuals',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requiere Light Manager.',
            'lightflow_environment.message.fit_selection': 'Sombras del entorno ajustadas a la geometría seleccionada.',
            'lightflow_environment.message.fit_scene': 'Sombras del entorno ajustadas a toda la geometría de la escena.',
            'lightflow_environment.message.fit_no_geometry': 'No hay geometría disponible para ajustar la región de sombras.'
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

    function beginEnvironmentProject(project) {
        environmentRevision += 1;
        environmentProject = project || null;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
        lastSunShadowConfig = '';
        lastSunShadowDirection = null;
        lastSunShadowRefresh = 0;
        lastSunShadowGizmoSignature = '';
    }

    function loadProjectSettings(project, model) {
        const activeProject = project || null;
        beginEnvironmentProject(activeProject);
        if (!activeProject) {
            if (skyMesh) skyMesh.visible = false;
            if (sunLight) {
                sunLight.intensity = 0;
            }
            return;
        }
        effectiveShadowFrustum = null;
        if (
            (!activeProject[PROJECT_PROPERTY] || !String(activeProject[PROJECT_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PROPERTY] === 'string'
        ) {
            activeProject[PROJECT_PROPERTY] = model[PROJECT_PROPERTY];
        }
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
        syncEnvironmentPanel();
        updateScene({ forceShadow: true, animation: false });
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
            syncEnvironmentPanel({ timeOnly: true });
            updateScene({ forceShadow: false, animation: true });
            dispatchChanged('animation');
            requestPreviewRender();
        };
        animationFrame = requestAnimationFrame(tick);
    }

    function disposeScene() {
        disposeSunShadowGizmo();
        if (sunLight) {
            if (window.three_lights?.[sunLight.uuid] === sunLight) delete window.three_lights[sunLight.uuid];
            sunLight.parent?.remove?.(sunLight);
            sunLight.shadow?.map?.dispose?.();
        }
        sunTarget?.parent?.remove?.(sunTarget);
        skyMesh?.parent?.remove?.(skyMesh);
        skyMesh?.geometry?.dispose?.();
        skyMaterial?.dispose?.();
        vanillaCloudTexture?.dispose?.();
        fallbackTexture?.dispose?.();
        if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
            Texture.all.forEach(texture => {
                texture?._lightflowEnvironmentTexture?.dispose?.();
                if (texture) delete texture._lightflowEnvironmentTexture;
            });
        }
        sunLight = null;
        sunTarget = null;
        skyMesh = null;
        skyMaterial = null;
        vanillaCloudTexture = null;
        fallbackTexture = null;
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
        dependencies: ['light_manager'],

        onload() {
            if (!window.LIGHT_MANAGER_LOADED || !window.LightManagerUI || typeof window.applyIndestructibleFormGroups !== 'function') {
                Blockbench.showToastNotification({
                    text: tr('lightflow_environment.message.light_manager_required', 'Lightflow Environment requires Light Manager.'),
                    icon: 'error',
                    expire: 10000
                });
                return;
            }
            registerProjectProperty();
            installUI();
            createSky();
            createSunLight();
            installSunShadowGizmoInteraction();

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

            const lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_environment',
                ({ project, model, isCurrent, deferred }) => {
                    if (deferred) {
                        beginEnvironmentProject(project);
                        return;
                    }
                    if (project && !isCurrent()) return;
                    loadProjectSettings(project, model);
                }
            );
            if (lifecycleHydrator) {
                deletables.push(lifecycleHydrator);
            } else {
                loadProjectSettings(window.Project || null, null);
                const selectListener = Blockbench.on('select_project', event => loadProjectSettings(event?.project || window.Project, null));
                const parsedListener = window.Codecs?.project?.on?.('parsed', () => loadProjectSettings(window.Project || null, null));
                deletables.push(selectListener, parsedListener);
            }
            const textureChanged = () => {
                syncEnvironmentPanel();
                updateScene({ forceShadow: false });
                requestPreviewRender();
            };
            const textureListeners = ['add_texture', 'remove_texture', 'update_texture']
                .map(eventName => Blockbench.on(eventName, textureChanged));
            const viewListener = Blockbench.on('update_view', () => updateSunShadowGizmo());
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(...textureListeners, viewListener, {
                delete() { window.removeEventListener('light_manager_initialized', lightManagerListener); }
            });
            startAnimation();
        },

        onunload() {
            beginEnvironmentProject(null);
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            disposeScene();
            deletables.splice(0).reverse().forEach(item => item?.delete?.());
            delete window.LightflowEnvironment;
            window.ShaderEngine?.updateLightUniforms?.();
        }
    });
})();
