(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.1.0';
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
    let environmentPanel = null;
    let syncingEnvironmentPanel = false;
    let vanillaCloudTexture = null;
    let fallbackTexture = null;
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
        if (options.syncPanel !== false) syncEnvironmentPanel();
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

    function createDialogForm() {
        const textureOptions = getTextureOptions();
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

    function createPanelForm() {
        return {
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            preset: { type: 'select', label: 'lightflow_environment.field.preset', value: settings.preset,
                options: { vanilla: 'Minecraft Vanilla', vibrant_visuals: 'Minecraft Vibrant Visuals' } },
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100 },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            cloud_mode: { type: 'select', label: 'lightflow_environment.field.cloud_mode', value: settings.cloud_mode,
                options: { procedural: 'lightflow_environment.option.cloud_procedural', vanilla: 'lightflow_environment.option.cloud_vanilla', texture: 'lightflow_environment.option.cloud_texture' } },
            panel_advanced: { type: 'buttons', buttons: ['lightflow_environment.action.open'], click() { openSettingsDialog(); } }
        };
    }

    function syncEnvironmentPanel() {
        if (!environmentPanel?.form || syncingEnvironmentPanel) return;
        syncingEnvironmentPanel = true;
        environmentPanel.form.form_config = createPanelForm();
        environmentPanel.form.buildForm();
        syncingEnvironmentPanel = false;
    }

    function openSettingsDialog() {
        new Dialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 720,
            form: createDialogForm(),
            onFormChange(form) {
                applySettings(form, { cause: 'dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                applySettings(form, { cause: 'dialog_confirm', forceShadow: true, syncPanel: true });
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
                applySettings({ time: this.value }, { cause: 'time_slider', forceShadow: false });
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
        environmentPanel = new Panel('lightflow_environment_panel', {
            name: 'lightflow_environment.plugin.title',
            icon: 'wb_twilight',
            growable: true,
            resizable: true,
            expand_button: true,
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [340, 460], height: 390,
                folded: false, attached_to: 'outliner', attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                render: {
                    slot: 'right_bar', height: 390, folded: false,
                    attached_to: 'outliner', attached_index: 1, sidebar_index: 1
                }
            },
            insert_after: 'outliner',
            toolbars: [toolbar],
            form: createPanelForm()
        });
        environmentPanel.form.on('change', ({ result }) => {
            if (syncingEnvironmentPanel) return;
            applySettings(result, { cause: 'environment_panel', forceShadow: false, syncPanel: false });
        });
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, timeSlider, animateToggle, toolbar, environmentPanel);
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
        syncEnvironmentPanel();
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
            updateScene({ forceShadow: false });
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
            const textureChanged = () => {
                syncEnvironmentPanel();
                updateScene({ forceShadow: false });
                requestPreviewRender();
            };
            const textureListeners = ['add_texture', 'remove_texture', 'update_texture']
                .map(eventName => Blockbench.on(eventName, textureChanged));
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(selectListener, loadListener, parsedListener, ...textureListeners, {
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
