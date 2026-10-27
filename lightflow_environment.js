(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.10.0';
    const STORAGE_KEY = 'lightflow_environment.settings';
    const PROJECT_PROPERTY = 'lightflow_environment_settings';
    const PROJECT_PRESETS_PROPERTY = 'lightflow_environment_sky_presets_json';
    const ENVIRONMENT_UNDO_ASPECT = 'lightflow_environment_settings';
    const SKY_PRESET_FILE_EXTENSION = 'lfenv';
    const SKY_PRESET_FILE_FORMAT = 'lightflow_environment_sky_preset';
    const SKY_PRESET_FILE_VERSION = 1;
    const TWO_PI = Math.PI * 2;
    const SKY_GRADIENT_TEXTURE_SIZE = 256;
    const SKY_GRADIENT_VERSION = 2;
    const SKY_GRADIENT_MAX_STOPS = 12;
    const SKY_TIME_GRADIENT_MAX_FRAMES = 24;
    const SKY_REFERENCE_CUSTOM_ANCHORS = Object.freeze([
        {time: 6000, phase: 'day'},
        {time: 12500, phase: 'sunset'},
        {time: 18000, phase: 'night'},
        {time: 23500, phase: 'sunrise'}
    ]);
    const CLOUD_TIME_PROFILE_MAX_FRAMES = 24;
    // Clock profiles change appearance, never texture topology or cloud motion.
    const CLOUD_TIME_NUMERIC_FIELDS = Object.freeze({
        cloud_coverage: [0, 1], cloud_opacity: [0, 1],
        cloud_contrast: [0.1, 4], cloud_brightness: [0, 4],
        cloud_bevel_width: [0, 0.45], cloud_bevel_softness: [0, 1],
        cloud_bevel_roundness: [0, 1], cloud_bevel_strength: [0, 2],
        cloud_bevel_distance_min_scale: [0.02, 1],
        cloud_edge_strength: [0, 2], cloud_shadow_bevel_strength: [0, 2],
        cloud_environment_influence: [0, 1], cloud_time_tint_strength: [0, 1],
        cloud_sky_tint_strength: [0, 1], cloud_sun_tint_strength: [0, 1],
        cloud_fog_strength: [0, 1], cloud_fog_start: [0, 0.98],
        cloud_fog_end: [0.01, 1], cloud_density: [0.05, 4],
        cloud_absorption: [0, 3], cloud_translucency: [0, 1],
        cloud_scattering_strength: [0, 3],
        cloud_scattering_size: [0.1, 4],
        cloud_edge_hardness: [0, 1],
        cloud_view_response: [0, 1],
        cloud_gradient_thickness: [0, 8],
        cloud_gradient_alpha: [0, 1],
        cloud_optical_thickness: [0.05, 4],
        cloud_phase_anisotropy: [0, 0.85],
        cloud_density_variation: [0, 0.3],
        cloud_bloom_contribution: [0, 4]
    });
    const CLOUD_TIME_COLOR_FIELDS = Object.freeze([
        'cloud_top_color', 'cloud_sun_side_color', 'cloud_shadow_side_color',
        'cloud_bottom_color', 'cloud_edge_color', 'cloud_shadow_bevel_color',
        'cloud_fog_color'
    ]);
    const SKY_HORIZON_POSITION = 0.5;

    // Vanilla PNGs are supplied locally by the user, never bundled or downloaded.

    const DEFAULT_SETTINGS = {
        enabled: false,
        preset: 'vanilla',
        time: 6000,
        animate_time: false,
        day_length_seconds: 120,
        sun_azimuth: 0,
        palette_mode: 'preset',
        // Preserve the user's authored custom palette while viewing native colors.
        sky_custom_palette_saved: false,
        // Use the native clock as an exact baseline and custom gradients as
        // editable per-phase color offsets. Older shared dawn/dusk scenes opt out.
        sky_custom_reference_match: false,
        dimension: 'overworld',
        dimension_fog_mode: 'preset',
        sky_cycle_mode: 'reference',
        zenith_color: '#79a7ff',
        horizon_color: '#bdd6ff',
        sunrise_zenith_color: '#647db5',
        sunrise_horizon_color: '#f59a62',
        night_zenith_color: '#05091d',
        night_horizon_color: '#151d3d',
        ground_color: '#bdd6ff',
        sun_color: '#fff3c4',
        moon_color: '#dbe4ff',
        cloud_color: '#f3f5f7',
        sky_intensity: 1,
        sky_gradient_power: 1,
        sky_time_gradients_enabled: false,
        // Opt-in clock keyframes. Empty preserves the phase-based sky blend.
        sky_time_gradients: [],
        day_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'day_ground', position: 0, color: '#bdd6ff', midpoint: 0.5 },
                { id: 'day_horizon', position: SKY_HORIZON_POSITION, color: '#bdd6ff', midpoint: 0.5 },
                { id: 'day_zenith', position: 1, color: '#79a7ff', midpoint: 0.5 }
            ]
        },
        sunrise_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'sunrise_ground', position: 0, color: '#6a5973', midpoint: 0.48 },
                { id: 'sunrise_horizon', position: SKY_HORIZON_POSITION, color: '#f59a62', midpoint: 0.46 },
                { id: 'sunrise_middle', position: 0.76, color: '#8a78c4', midpoint: 0.54 },
                { id: 'sunrise_zenith', position: 1, color: '#647db5', midpoint: 0.5 }
            ]
        },
        // null means the old shared dawn/dusk gradient. Existing projects keep
        // their exact colors; switching a native reference palette to custom
        // seeds an independent sunset snapshot instead.
        sunset_sky_gradient: null,
        night_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'night_ground', position: 0, color: '#0a0c16', midpoint: 0.48 },
                { id: 'night_horizon', position: SKY_HORIZON_POSITION, color: '#151d3d', midpoint: 0.48 },
                { id: 'night_middle', position: 0.74, color: '#0b102d', midpoint: 0.5 },
                { id: 'night_zenith', position: 1, color: '#05091d', midpoint: 0.5 }
            ]
        },
        star_density: 1,
        environment_strength: 0.75,
        ambient_fill_color_mode: 'sky',
        ambient_fill_shape: 'preset',
        ambient_fill_sky_color: '#ffffff',
        ambient_fill_ground_color: '#ffffff',
        ambient_fill_day_multiplier: 1,
        ambient_fill_night_multiplier: 1,
        distance_fog_enabled: false,
        distance_fog_color_mode: 'sky',
        distance_fog_fixed_color: '#c4d6e6',
        distance_fog_near_color: '#dce8f2',
        distance_fog_day_color: '#bdd6ff',
        distance_fog_sunrise_color: '#f0a678',
        distance_fog_night_color: '#151d3d',
        distance_fog_start: 32,
        distance_fog_end: 160,
        distance_fog_smoothness: 0.8,
        distance_fog_curve: 1,
        distance_fog_sky_blend: 0,
        distance_fog_noise: 0,
        distance_fog_noise_scale: 24,
        distance_fog_gradient: 0.35,
        distance_fog_dither: 0,
        distance_fog_max_opacity: 1,
        distance_fog_sync_background: true,
        distance_grade_enabled: false,
        distance_grade_follow_fog: false,
        distance_grade_curve: 1,
        distance_grade_pivot: 0.5,
        distance_grade_pivot_mode: 'fixed',
        distance_grade_tint_mode: 'fixed',
        distance_grade_start: 32,
        distance_grade_end: 160,
        distance_grade_saturation: 0.75,
        distance_grade_contrast: 0.85,
        distance_grade_tint: '#c4d6e6',
        distance_grade_tint_strength: 0.15,
        sun_enabled: true,
        sun_intensity: 2.2,
        sun_light_color_mode: 'sun',
        sun_light_day_color: '#fff7c7',
        sun_light_twilight_color: '#ffad74',
        moon_intensity: 0.28,
        moon_light_color_mode: 'moon',
        moon_light_custom_color: '#a9c8ff',
        celestial_size: 0.1,
        moon_size: 0.1,
        moon_phase: 0,
        sun_mode: 'vanilla',
        moon_mode: 'vanilla',
        sun_blend_mode: 'preset',
        sun_opacity: 1,
        moon_blend_mode: 'preset',
        moon_opacity: 1,
        sun_texture_uuid: '',
        moon_texture_uuid: '',
        // Moon atlas frames are read left-to-right, top-to-bottom:
        // full, waning gibbous, third quarter, waning crescent,
        // new, waxing crescent, first quarter, waxing gibbous.
        moon_texture_layout: 'atlas',
        moon_atlas_columns: 4,
        moon_atlas_rows: 2,
        moon_phase_offset: 0,
        sun_horizon_scale: 1.34,
        sun_gaze_scale: 1.16,
        sun_glare: 0.25,
        sunset_directional_glow: 1,
        environment_bloom_enabled: false,
        bloom_threshold: 0.82,
        bloom_soft_knee: 0.42,
        bloom_strength: 0.72,
        bloom_core_strength: 0.78,
        bloom_core_radius: 1.25,
        bloom_halo_strength: 0.24,
        bloom_halo_radius: 10,
        bloom_hdr_strength: 1.15,
        bloom_emissive_strength: 1.2,
        bloom_occlusion: 0.92,
        sun_bloom_contribution: 1,
        moon_bloom_contribution: 0.45,
        star_bloom_contribution: 0.35,
        cloud_bloom_contribution: 0.08,
        stars_enabled: true,
        star_brightness: 0.72,
        clouds_enabled: true,
        cloud_mode: 'vanilla',
        cloud_style: 'vanilla',
        cloud_palette_mode: 'preset',
        cloud_time_profiles_enabled: false,
        cloud_time_profiles: [],
        cloud_texture_uuid: '',
        cloud_coverage: 0.54,
        cloud_opacity: 0.78,
        cloud_speed: 0.016,
        cloud_paused: false,
        cloud_motion_phase: 0,
        cloud_offset_x: 0,
        cloud_offset_y: 0,
        cloud_scale: 1,
        cloud_direction: 0,
        cloud_contrast: 1,
        cloud_brightness: 1,
        cloud_height: 512,
        cloud_thickness: 4,
        cloud_extrusion: 1,
        cloud_top_color: '#fbfdff',
        cloud_sun_side_color: '#e8f1f8',
        cloud_shadow_side_color: '#c6d5e4',
        cloud_bottom_color: '#9caec4',
        cloud_edge_color: '#fff4c2',
        cloud_bevel_width: 0.14,
        cloud_bevel_softness: 0.62,
        cloud_bevel_roundness: 0.82,
        cloud_bevel_strength: 0.72,
        cloud_bevel_enabled: true,
        cloud_bevel_smooth: true,
        cloud_scattering_strength: 1,
        cloud_scattering_size: 1,
        cloud_edge_hardness: 0,
        cloud_view_response: 0,
        cloud_gradient_thickness: 1,
        cloud_gradient_alpha: 0,
        cloud_optical_thickness: 1,
        cloud_phase_anisotropy: 0.46,
        cloud_density_variation: 0.03,
        cloud_bevel_distance_fade: true,
        cloud_bevel_distance_min_scale: 0.28,
        cloud_edge_strength: 0.2,
        cloud_shadow_bevel_color: '#8fa4b8',
        cloud_shadow_bevel_strength: 0.34,
        cloud_lighting_mode: 'mixed',
        cloud_environment_influence: 1,
        cloud_time_tint_strength: 1,
        cloud_sky_tint_strength: 0.42,
        cloud_sun_tint_strength: 0.58,
        cloud_fog_enabled: true,
        cloud_fog_color_mode: 'sky',
        cloud_fog_color: '#bdd6ff',
        cloud_fog_strength: 0.72,
        cloud_fog_start: 0.42,
        cloud_fog_end: 0.92,
        cloud_density: 1,
        cloud_absorption: 0,
        cloud_translucency: 0.28,
        lens_flare_enabled: false,
        lens_flare_strength: 0.45,
        lens_flare_scale: 1,
        sun_cast_shadows: true,
        shadow_area: 48,
        shadow_near: 0.1,
        shadow_far: 480,
        shadow_resolution: 2048,
        studio_shadow_resolution: 0,
        shadow_camera_quality: 'balanced',
        shadow_camera_distance: 256,
        shadow_softness: 1,
        shadow_softness_mode: 'hard',
        shadow_blur: 8,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.025,
        shadow_normal_bias_auto: true,
        shadow_auto_fit: true,
        shadow_scene_fit: true,
        shadow_region_locked: false,
        shadow_fit_corners: null,
        show_shadow_gizmo: true,
        pixelated_shadows: false,
        pixel_shadow_steps: 4,
        pixel_shadow_scale: 2
    };

    const RENDERCRAFT_CLOUD_BEVEL_DEFAULTS = Object.freeze({
        width: 0.025,
        softness: 0.0,
        roundness: 0.0,
        strength: 2.0,
        smooth: false,
        distanceFade: true,
        distanceMinScale: 0.22,
        highlightStrength: 2.0,
        shadowStrength: 1.32
    });

    const PRESETS = {
        vanilla: {
            name: 'Minecraft Vanilla',
            zenith: '#79a7ff', horizon: '#bdd6ff',
            sunrise_zenith: '#647db5', sunrise_horizon: '#f59a62',
            night_zenith: '#05091d', night_horizon: '#151d3d',
            ground: '#bdd6ff', sunrise_ground: '#6a5973', night_ground: '#0a0c16',
            sun: '#fff3c4', moon: '#dbe4ff', cloud: '#f3f5f7',
            cloud_shadow_edge: '#93a5b8',
            ambient_day: 0.78, ambient_night: 0.17
        },
        cineflow: {
            name: 'CineFlow',
            zenith: '#2d99e8', horizon: '#cbe1ee',
            sunrise_zenith: '#605294', sunrise_horizon: '#faab78',
            night_zenith: '#071229', night_horizon: '#253b67',
            ground: '#b0c8dc', sunrise_ground: '#77647e', night_ground: '#0b1629',
            sun: '#fff1cf', moon: '#bdd5ff', cloud: '#f6f5ee',
            cloud_shadow_edge: '#9daec7',
            ambient_day: 0.74, ambient_night: 0.16,
            // The visible backdrop and incident fill have separate art direction.
            // A dark night sky still supplies readable blue fill to shaded faces.
            ambient_sky_day: '#aec5e8', ambient_ground_day: '#918b75',
            ambient_sky_twilight: '#9187c1', ambient_ground_twilight: '#8a666e',
            ambient_sky_night: '#5c7bad', ambient_ground_night: '#293a58'
        },
        vibrant_visuals: {
            name: 'Minecraft Vibrant Visuals',
            zenith: '#3184ff', horizon: '#a6dcff',
            sunrise_zenith: '#6b69bd', sunrise_horizon: '#ff874d',
            night_zenith: '#030824', night_horizon: '#1f2b5b',
            ground: '#416579', sunrise_ground: '#553d5c', night_ground: '#050717',
            sun: '#fff1b0', moon: '#cbdcff', cloud: '#fff7ec',
            cloud_top: '#fff9ee', cloud_sun_side: '#eeeaf4',
            cloud_shadow_side: '#d7d9e8', cloud_bottom: '#d4d8e7',
            cloud_edge: '#fff4dc', cloud_shadow_edge: '#adbad0',
            ambient_day: 0.92, ambient_night: 0.21
        },
        rendercraft: {
            name: 'Rendercraft',
            zenith: '#41b6f8', horizon: '#e4f8ea',
            sunrise_zenith: '#5473a5', sunrise_horizon: '#d1b5aa',
            night_zenith: '#040f22', night_horizon: '#3a72ae',
            ground: '#c4dcd7', sunrise_ground: '#7c687b', night_ground: '#0b1828',
            sun: '#fff7c7', moon: '#dce9ff', cloud: '#edf8ff',
            cloud_top: '#fcfeff', cloud_sun_side: '#e9f4fa',
            cloud_shadow_side: '#bed2e2', cloud_bottom: '#8fa8bc', cloud_edge: '#fff3c4',
            cloud_shadow_edge: '#7f98ad',
            ambient_day: 0.74, ambient_night: 0.16,
            cloud_brightness: 1.25,
            day_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'srgb', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_day_ground', position: 0, color: '#c4dcd7', midpoint: 0.5 },
                    { id: 'rendercraft_day_horizon', position: SKY_HORIZON_POSITION, color: '#e4f8ea', midpoint: 0.5 },
                    { id: 'rendercraft_day_middle', position: 0.74, color: '#77cef5', midpoint: 0.5 },
                    { id: 'rendercraft_day_zenith', position: 1, color: '#41b6f8', midpoint: 0.5 }
                ]
            },
            sunrise_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'srgb', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_sunrise_ground', position: 0, color: '#7c687b', midpoint: 0.5 },
                    { id: 'rendercraft_sunrise_horizon', position: SKY_HORIZON_POSITION, color: '#d1b5aa', midpoint: 0.5 },
                    { id: 'rendercraft_sunrise_middle', position: 0.74, color: '#9690c1', midpoint: 0.5 },
                    { id: 'rendercraft_sunrise_zenith', position: 1, color: '#5473a5', midpoint: 0.5 }
                ]
            },
            night_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'srgb', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_night_ground', position: 0, color: '#0b1828', midpoint: 0.5 },
                    { id: 'rendercraft_night_horizon', position: SKY_HORIZON_POSITION, color: '#3a72ae', midpoint: 0.5 },
                    { id: 'rendercraft_night_middle', position: 0.74, color: '#22416f', midpoint: 0.5 },
                    { id: 'rendercraft_night_zenith', position: 1, color: '#040f22', midpoint: 0.5 }
                ]
            }
        }
    };

    // Keyframe clock follows the documented Bedrock convention: noon=0,
    // sunset=.25, midnight=.5, sunrise=.75. Display palettes are fitted to
    // reference images, not claimed to reproduce RenderDragon's scattering.
    // Source ledger and measured rectangles: artifacts/environment-research-2026-10-08.
    const REFERENCE_SKY_CYCLES = Object.freeze({
        vanilla: [
            [0, '#b3d1f3', '#b3d1f3', '#8eb6ff', '#79a7ff', '#ffffff', '#bdc6dc'],
            [.18, '#aebac9', '#ccd8df', '#86abdf', '#769acf', '#faf8f0', '#adb9cf'],
            [.25, '#683e34', '#d97025', '#694054', '#4b3d56', '#af7e66', '#715449'],
            [.270833, '#583025', '#a4430e', '#633f41', '#4c3e53', '#a27960', '#665045'],
            [.32, '#182238', '#34496d', '#142744', '#091425', '#50638b', '#27354f'],
            [.5, '#060910', '#0a0d16', '#05060b', '#030408', '#1a1c2b', '#0e101d'],
            [.68, '#283249', '#53647f', '#314466', '#162840', '#647591', '#354663'],
            [.75, '#806c7c', '#edb795', '#b0a2c5', '#7795c5', '#e5d4db', '#9b8fae'],
            [.82, '#b3d1f3', '#d4dff0', '#9db9e3', '#79a7ff', '#ffffff', '#bdc6dc']
        ],
        rendercraft: [
            [0, '#c4dcd7', '#e4f8ea', '#77cef5', '#41b6f8', '#fffdf4', '#a8bdce'],
            [.18, '#a4a7a3', '#ddb981', '#8ca6be', '#366caf', '#e5dac8', '#9dacc4'],
            [.25, '#674c70', '#c06063', '#5e316e', '#190e42', '#a77dbb', '#5d4099'],
            [.32, '#17243c', '#557bad', '#253e78', '#0c173c', '#556997', '#293e68'],
            [.5, '#0b1828', '#3a72ae', '#22416f', '#040f22', '#6582a6', '#354e73'],
            [.68, '#364761', '#788eb9', '#4c60a2', '#26376d', '#8d9cbe', '#566a98'],
            [.75, '#997686', '#f7c6a4', '#b5a4ce', '#688cbd', '#ffe6d5', '#a998bf'],
            [.82, '#c4dcd7', '#e0f0e8', '#86c5e7', '#41b6f8', '#fffdf4', '#a8bdce']
        ],
        vibrant_visuals: [
            [0, '#a0afc5', '#bbc4e2', '#92aadf', '#88a5e0', '#f9f6fc', '#b2b7d4'],
            [.167053, '#a7a49f', '#b7bdc6', '#9baed0', '#88a5e0', '#f8f1e9', '#b0b7ce'],
            [.239274, '#89707c', '#ffbba3', '#b595bc', '#69708f', '#f6dfcf', '#a69cc1'],
            [.270833, '#8b696b', '#a87774', '#656682', '#5b6381', '#dac1af', '#a29aac'],
            [.276382, '#514357', '#886c6c', '#5d527c', '#393e5f', '#b5a0b4', '#6e668d'],
            [.325, '#232531', '#2a2a34', '#21252f', '#20242f', '#41425a', '#2e3046'],
            [.361464, '#1a202a', '#222732', '#1d222c', '#1c212a', '#45465c', '#303247'],
            [.5, '#131921', '#1a1e27', '#1a1a1e', '#1b1c20', '#56586e', '#37394e'],
            [.654508, '#252831', '#3e3c49', '#2e3241', '#292e3a', '#54576e', '#393e55'],
            [.706861, '#51434b', '#66505a', '#414354', '#343f53', '#757b95', '#48536c'],
            [.708333, '#8b6460', '#b37a6b', '#55566a', '#343f53', '#757b95', '#48536c'],
            [.729167, '#b58a70', '#de9e76', '#8c8197', '#596a8b', '#ddc8c6', '#9f9db9'],
            [.748744, '#a98789', '#ffd3b3', '#ceb2d2', '#7e91b6', '#ffe4d3', '#b3a3ca'],
            [.830049, '#a0afc5', '#bbc4e2', '#92aadf', '#88a5e0', '#f9f6fc', '#b2b7d4']
        ]
    });
    // Atmosphere/fog endpoints copied from the official v1.26.50.4 resource pack.
    // Distances below are Lightflow scene units; the resource's block/render
    // distance units are deliberately not transplanted into a model viewport.
    const DIMENSION_ATMOSPHERES = Object.freeze({
        overworld: null,
        nether: {zenith:'#330808', horizon:'#330808', fog:'#330808', ambient:'#b76c59', ground:'#6b2923', fill:.42},
        crimson_forest: {zenith:'#330303', horizon:'#330303', fog:'#330303', ambient:'#cc7182', ground:'#711f35', fill:.40},
        warped_forest: {zenith:'#1e0f1e', horizon:'#1e0f1e', fog:'#1a051a', ambient:'#987ca5', ground:'#452c4d', fill:.43},
        soulsand_valley: {zenith:'#1b4745', horizon:'#1b4745', fog:'#1b4745', ambient:'#8bb9c5', ground:'#4b6772', fill:.40},
        basalt_deltas: {zenith:'#685f70', horizon:'#685f70', fog:'#685f70', ambient:'#bbb0bb', ground:'#625668', fill:.36},
        end: {zenith:'#161124', horizon:'#010105', fog:'#0b080c', ambient:'#9785bd', ground:'#554466', fill:.32}
    });

    function getDimensionAtmosphere() {
        return DIMENSION_ATMOSPHERES[settings.dimension] || null;
    }

    function getReferenceCycleFrame(timeValue = settings.time, forPresetDefaults = false) {
        if (settings.sky_cycle_mode !== 'reference' || (settings.palette_mode === 'custom' && !forPresetDefaults) || getDimensionAtmosphere()) return null;
        const rows = REFERENCE_SKY_CYCLES[settings.preset === 'cineflow' ? 'rendercraft' : settings.preset];
        if (!rows) return null;
        const phase = mod((timeValue - 6000) / 24000, 1);
        let left = rows[rows.length - 1], right = rows[0];
        for (let index = 0; index < rows.length - 1; index++) {
            if (phase >= rows[index][0] && phase < rows[index + 1][0]) {
                left = rows[index]; right = rows[index + 1]; break;
            }
        }
        const rightTime = right[0] > left[0] ? right[0] : right[0] + 1;
        const amount = clamp((phase - left[0]) / (rightTime - left[0]), 0, 1);
        return ['ground','horizon','middle','zenith','cloudTop','cloudBottom'].reduce((frame,key,index) => {
            frame[key] = mixColor(hexToRgb(left[index + 1]), hexToRgb(right[index + 1]), amount);
            return frame;
        }, {phase});
    }

    function sampleReferenceSkyColor(position, frame = getReferenceCycleFrame()) {
        const dimension = getDimensionAtmosphere();
        if (dimension) return mixColor(hexToRgb(dimension.horizon), hexToRgb(dimension.zenith), clamp((position - .5) * 2, 0, 1));
        if (!frame) return null;
        const stops = [[0,frame.ground],[.5,frame.horizon],[.74,frame.middle],[1,frame.zenith]];
        for (let index=0; index<stops.length-1; index++) {
            const a=stops[index], b=stops[index+1];
            if (position <= b[0]) return mixColor(a[1],b[1],smoothstep(a[0],b[0],position));
        }
        return frame.zenith;
    }

    const NATIVE_SKY_PRESET_DEFINITIONS = Object.freeze({
        vanilla: Object.freeze({ icon: 'landscape', iconColor: 'light_blue' }),
        cineflow: Object.freeze({ icon: 'movie', iconColor: 'purple' }),
        vibrant_visuals: Object.freeze({ icon: 'auto_awesome', iconColor: 'yellow' }),
        rendercraft: Object.freeze({ icon: 'view_in_ar', iconColor: 'orange' })
    });
    const ENVIRONMENT_PRESET_ICON_OPTIONS = Object.freeze([
        { id: 'landscape', icon: 'landscape', label: 'Landscape' },
        { id: 'twilight', icon: 'wb_twilight', label: 'Twilight' },
        { id: 'sun', icon: 'light_mode', label: 'Sun' },
        { id: 'moon', icon: 'nights_stay', label: 'Moon' },
        { id: 'clouds', icon: 'cloud', label: 'Clouds' },
        { id: 'stars', icon: 'auto_awesome', label: 'Stars' },
        { id: 'gradient', icon: 'gradient', label: 'Gradient' },
        { id: 'palette', icon: 'palette', label: 'Palette' },
        { id: 'terrain', icon: 'terrain', label: 'Terrain' },
        { id: 'forest', icon: 'forest', label: 'Forest' },
        { id: 'water', icon: 'water_drop', label: 'Water' },
        { id: 'atmosphere', icon: 'filter_drama', label: 'Atmosphere' },
        { id: 'custom', icon: 'edit', label: 'Custom', custom: true }
    ].map(option => Object.freeze(option)));

    const presetSkyGradientProfileCache = new Map();

    let settings = loadSettings();
    let skyMesh = null;
    let skyMaterial = null;
    let skyGradientTexture = null;
    let skyGradientTextureData = null;
    let lastSkyGradientSignature = '';
    let skyGradientSamples = null;
    let starMesh = null;
    let starMaterial = null;
    let starAttemptIndexCounts = null;
    let cloudMesh = null;
    let lensFlareMesh = null;
    let lensFlareMaterial = null;
    let lensVisibilityScene = null;
    let lensVisibilityTarget = null;
    let lensAlphaProbe = null;
    let cloudMaterial = null;
    let sunLight = null;
    let sunTarget = null;
    let sunShadowGizmo = null;
    let sunShadowGizmoDrag = null;
    let sunShadowGizmoRaycaster = null;
    let storageWriteFailureReported = false;
    let sunShadowGizmoMouse = null;
    let effectiveShadowFrustum = null;
    const sunShadowGizmoListeners = [];
    let settingsAction = null;
    let environmentPanel = null;
    let environmentPanelFormDirty = false;
    let pendingProjectTextureChanges = false;
    let syncingEnvironmentPanel = false;
    let environmentPanelAttachmentEstablished = false;
    let environmentPanelCategory = 'sky';
    const environmentPanelGroupsOpen = {
        time: true,
        sky: false,
        fog: false,
        fog_texture: false,
        distance_grade: false,
        celestial: true,
        moon: false,
        stars: false,
        clouds: true,
        cloud_motion: false,
        cloud_palette: false,
        cloud_lighting: false,
        cloud_detail: false,
        ambient: false,
        bloom: false,
        shadows: false
    };
    const environmentPanelLayoutKeys = new Set([
        'dimension', 'dimension_fog_mode', 'sky_cycle_mode', 'animate_time', 'palette_mode',
        'sky_time_gradients_enabled', 'sky_time_gradients', 'distance_fog_enabled',
        'distance_fog_color_mode', 'distance_fog_gradient', 'distance_fog_noise',
        'distance_grade_enabled', 'distance_grade_follow_fog', 'distance_grade_tint_mode', 'distance_grade_pivot_mode', 'sun_enabled',
        'sun_mode', 'moon_mode', 'moon_texture_layout', 'stars_enabled',
        'clouds_enabled', 'cloud_style', 'cloud_mode', 'cloud_palette_mode',
        'cloud_time_profiles_enabled', 'cloud_time_profiles',
        'cloud_bevel_enabled', 'cloud_bevel_smooth', 'cloud_bevel_distance_fade', 'cloud_lighting_mode',
        'cloud_fog_enabled', 'cloud_fog_color_mode', 'environment_bloom_enabled',
        'sun_cast_shadows', 'shadow_auto_fit', 'shadow_scene_fit', 'shadow_region_locked', 'pixelated_shadows'
    ]);
    let vanillaSunTexture = null;
    let endSkyTexture = null;
    let vibrantVisualsSunTexture = null;
    let vanillaMoonPhasesTexture = null;
    let vanillaCloudTexture = null;
    let proceduralCloudTexture = null;
    let cloudOccupancyCache = new WeakMap();
    const cloudOccupancyTextures = new Set();
    let cloudDistanceCache = new WeakMap();
    const cloudDistanceTextures = new Set();
    let cloudDistanceWorker = null;
    let cloudDistanceWorkerUrl = null;
    let cloudDistancePending = null;
    let cloudDistanceJob = null;
    let fallbackTexture = null;
    let builtInSkyTexturesReady = false;
    let missingSkyTexture = null;
    let vanillaResourceDialog = null;
    let projectTextureCache = new WeakMap();
    const externalEnvironmentTextures = new Map();
    let projectEnvironmentTextures = new Set();
    let projectProperty = null;
    let projectPresetsProperty = null;
    let customSkyPresets = {};
    let activeSkyPresetId = 'vanilla';
    let applyingSkyPreset = false;
    let environmentUndoHooks = null;
    let activeEnvironmentUndo = null;
    let animationFrame = null;
    let animationHandleType = '';
    let previewRenderFrame = null;
    let lastFrameTime = 0;
    let lastRenderTime = 0;
    let studioCloudMotionSeconds = null;
    const cloudRuntimeStats = {
        sourceCacheBuilds: 0,
        occupancyBuilds: 0,
        distanceBuilds: 0,
        distanceBuildMs: 0,
        lastAnimationIntervalMs: 33,
        requestedFrames: 0
    };
    const settingsPerformance = {
        calls: 0,
        fogOnlyCalls: 0,
        maxTotalMs: 0,
        last: null
    };
    let environmentRevision = 0;
    let lastDistanceFogEnabled = null;
    let distanceFogCache = null;
    let distanceFogCacheSettings = null;
    let distanceFogCacheTime = null;
    let ownedDistanceFog = null;
    let previousDistanceFog = null;
    let ownedDistanceFogBackground = null;
    let previousDistanceFogBackground = null;
    let environmentProject = null;
    let lastSunShadowConfig = '';
    let lastSunShadowDirection = null;
    let lastSunShadowRefresh = 0;
    let lastSunShadowGizmoSignature = '';
    const deletables = [];
    const environmentTaskDialogs = new Set();
    deletables.push({delete() { for (const dialog of [...environmentTaskDialogs]) { dialog.cancel(); dialog.delete(); } }});
    const publishedWindowBindings = new Map();

    /*
     * UI settings flow through updateScene(), which owns the sky mesh and the
     * THREE directional light. getVirtualLight() exposes the same state to
     * Shader Architect so both render paths agree on light and shadow state.
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
                console.warn('[Lightflow Environment] Failed to release a registered resource.', error);
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

    function cloneEnvironmentData(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function createEnvironmentPresetId() {
        const suffix = typeof guid === 'function'
            ? guid()
            : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        return `sky_${suffix}`;
    }

    function normalizeEnvironmentPresetIcon(icon, fallback = 'landscape') {
        const value = typeof icon === 'string' ? icon.trim() : '';
        return value || fallback;
    }

    function getEnvironmentMarkerPresets() {
        return Array.isArray(window.LightManagerUI?.markerPresets)
            ? window.LightManagerUI.markerPresets
            : [];
    }

    function normalizeEnvironmentPresetColor(color) {
        const value = typeof color === 'string' ? color.trim() : '';
        if (!value) return '';
        const marker = getEnvironmentMarkerPresets().find(entry => (
            entry?.id === value || entry?.standard === value || entry?.pastel === value
        ));
        return marker?.id || '';
    }

    function getEnvironmentPresetColorCSS(color, fallback = 'var(--color-text)') {
        const normalized = normalizeEnvironmentPresetColor(color);
        const marker = getEnvironmentMarkerPresets().find(entry => entry?.id === normalized);
        return marker?.standard || marker?.pastel || fallback;
    }

    function getNativeSkyPresetDefinition(presetId) {
        const id = PRESETS[presetId] ? presetId : 'vanilla';
        const identity = NATIVE_SKY_PRESET_DEFINITIONS[id] || NATIVE_SKY_PRESET_DEFINITIONS.vanilla;
        return {
            id,
            native: true,
            name: PRESETS[id]?.name || id,
            icon: identity.icon,
            iconColor: identity.iconColor,
            basePresetId: id
        };
    }

    function getSkyPreset(presetId = activeSkyPresetId) {
        if (PRESETS[presetId]) return getNativeSkyPresetDefinition(presetId);
        return customSkyPresets[presetId] || null;
    }

    function isNativeSkyPresetSelected() {
        return !!PRESETS[activeSkyPresetId];
    }

    // Project-local adjustments never mutate the built-in preset definitions.
    const NATIVE_QUICK_SETTINGS = new Set([
        'enabled', 'time', 'animate_time', 'day_length_seconds', 'sun_azimuth',
        'sun_intensity', 'sun_cast_shadows',
        'cloud_paused', 'cloud_motion_phase', 'cloud_offset_x', 'cloud_offset_y',
        'shadow_auto_fit', 'shadow_scene_fit', 'shadow_region_locked', 'shadow_fit_corners',
        'show_shadow_gizmo', 'shadow_normal_bias_auto', 'shadow_camera_quality', 'shadow_camera_distance',
        'shadow_resolution', 'studio_shadow_resolution'
    ]);
    let nativeQuickOverrides = {};

    function getActiveSkyPresetIdentity() {
        const preset = getSkyPreset() || getNativeSkyPresetDefinition(settings.preset);
        return {
            id: preset.id,
            native: !!preset.native,
            name: preset.name,
            icon: normalizeEnvironmentPresetIcon(preset.icon, 'landscape'),
            iconColor: getEnvironmentPresetColorCSS(preset.iconColor)
        };
    }

    function captureEnvironmentPresetSettings(source = settings, basePresetId = source?.preset) {
        const snapshot = cloneEnvironmentData(source || {});
        delete snapshot.enabled;
        delete snapshot.shadow_fit_corners;
        delete snapshot.show_shadow_gizmo;
        snapshot.preset = PRESETS[basePresetId] ? basePresetId : 'vanilla';
        return snapshot;
    }

    function normalizeCustomSkyPreset(data, options = {}) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        let id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : createEnvironmentPresetId();
        if (PRESETS[id] || (customSkyPresets[id] && !options.overwrite)) id = createEnvironmentPresetId();
        const basePresetId = PRESETS[data.basePresetId]
            ? data.basePresetId
            : (PRESETS[data.settings?.preset] ? data.settings.preset : 'vanilla');
        const nativeIdentity = getNativeSkyPresetDefinition(basePresetId);
        const requestedName = typeof data.name === 'string' ? data.name.trim() : '';
        return {
            id,
            native: false,
            name: requestedName || `${nativeIdentity.name} Custom`,
            icon: normalizeEnvironmentPresetIcon(data.icon, nativeIdentity.icon),
            iconColor: normalizeEnvironmentPresetColor(data.iconColor || data.icon_color) || nativeIdentity.iconColor,
            basePresetId,
            settings: captureEnvironmentPresetSettings(
                normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, data.settings || {}, { preset: basePresetId })),
                basePresetId
            ),
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Number(data.updatedAt) || Date.now()
        };
    }

    function getUniqueSkyPresetName(name, excludeId = '') {
        const baseName = String(name || '').trim() || 'Custom Sky';
        const used = new Set(Object.values(customSkyPresets)
            .filter(preset => preset.id !== excludeId)
            .map(preset => String(preset.name || '').trim().toLowerCase()));
        if (!used.has(baseName.toLowerCase())) return baseName;
        for (let index = 2; index < 1000; index++) {
            const candidate = `${baseName} ${index}`;
            if (!used.has(candidate.toLowerCase())) return candidate;
        }
        return `${baseName} ${Date.now().toString(36).slice(-4)}`;
    }

    function serializeEnvironmentPresetRegistry() {
        return JSON.stringify({
            version: 1,
            activePresetId: activeSkyPresetId,
            quickOverrides: cloneEnvironmentData(nativeQuickOverrides),
            presets: Object.values(customSkyPresets).map(preset => cloneEnvironmentData(preset))
        });
    }

    function saveEnvironmentPresetRegistry(options = {}) {
        if (typeof Project === 'undefined' || !Project) return false;
        Project[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
        if (options.markSaved !== false && typeof Project.saved === 'boolean') Project.saved = false;
        return true;
    }

    function loadEnvironmentPresetRegistry(project, model, options = {}) {
        customSkyPresets = {};
        nativeQuickOverrides = {};
        activeSkyPresetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
        if (!project) return;
        if (
            (!project[PROJECT_PRESETS_PROPERTY] || !String(project[PROJECT_PRESETS_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PRESETS_PROPERTY] === 'string'
        ) {
            project[PROJECT_PRESETS_PROPERTY] = model[PROJECT_PRESETS_PROPERTY];
        }
        const raw = project[PROJECT_PRESETS_PROPERTY];
        if (typeof raw !== 'string' || !raw.trim()) {
            if (options.migrateLegacy !== true) return;
            const basePresetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
            const currentSnapshot = captureEnvironmentPresetSettings(settings, basePresetId);
            const nativeSnapshot = captureEnvironmentPresetSettings(
                getNativeSkyPresetSettings(basePresetId, { enabled: settings.enabled }),
                basePresetId
            );
            if (JSON.stringify(currentSnapshot) !== JSON.stringify(nativeSnapshot)) {
                const identity = getNativeSkyPresetDefinition(basePresetId);
                const migrated = normalizeCustomSkyPreset({
                    name: 'Project Environment',
                    icon: identity.icon,
                    iconColor: identity.iconColor,
                    basePresetId,
                    settings: currentSnapshot
                });
                if (migrated) {
                    customSkyPresets[migrated.id] = migrated;
                    activeSkyPresetId = migrated.id;
                    project[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
                    if (typeof project.saved === 'boolean') project.saved = false;
                }
            }
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            for (const [id, values] of Object.entries(parsed?.quickOverrides || {})) {
                if (!PRESETS[id] || !values || typeof values !== 'object') continue;
                const normalized = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, values));
                nativeQuickOverrides[id] = Object.fromEntries(Object.keys(values)
                    .filter(key => NATIVE_QUICK_SETTINGS.has(key))
                    .map(key => [key, cloneEnvironmentData(normalized[key])]));
            }
            const entries = Array.isArray(parsed?.presets)
                ? parsed.presets
                : Object.values(parsed?.presets || {});
            entries.forEach(entry => {
                const preset = normalizeCustomSkyPreset(entry, { overwrite: true });
                if (preset) customSkyPresets[preset.id] = preset;
            });
            const requestedActiveId = typeof parsed?.activePresetId === 'string'
                ? parsed.activePresetId
                : '';
            if (PRESETS[requestedActiveId] || customSkyPresets[requestedActiveId]) {
                activeSkyPresetId = requestedActiveId;
            }
        } catch (error) {
            console.warn('[Lightflow Environment] Sky preset registry is invalid; native presets remain available.', error);
        }
    }

    function syncActiveCustomSkyPresetFromSettings(cause) {
        const preset = customSkyPresets[activeSkyPresetId];
        if (!preset || applyingSkyPreset || cause === 'animation' || cause === 'project_load') return false;
        const nextSettings = captureEnvironmentPresetSettings(settings, preset.basePresetId);
        if (JSON.stringify(nextSettings) === JSON.stringify(preset.settings)) return false;
        preset.settings = nextSettings;
        preset.updatedAt = Date.now();
        saveEnvironmentPresetRegistry();
        return true;
    }

    function getEnvironmentUndoAspects() {
        return { [ENVIRONMENT_UNDO_ASPECT]: true };
    }

    function beginEnvironmentUndo(labelKey = 'lightflow_environment.undo.edit') {
        if (activeEnvironmentUndo || typeof Undo === 'undefined') return !!activeEnvironmentUndo;
        const aspects = getEnvironmentUndoAspects();
        Undo.initEdit(aspects);
        activeEnvironmentUndo = { aspects, labelKey, changed: false };
        return true;
    }

    function markEnvironmentUndoChanged() {
        if (activeEnvironmentUndo) activeEnvironmentUndo.changed = true;
    }

    function finishEnvironmentUndo() {
        const active = activeEnvironmentUndo;
        if (!active) return false;
        activeEnvironmentUndo = null;
        if (active.changed) Undo.finishEdit(tl(active.labelKey), active.aspects);
        else Undo.cancelEdit(false);
        return true;
    }

    function cancelEnvironmentUndo(revert = false) {
        if (!activeEnvironmentUndo) return false;
        activeEnvironmentUndo = null;
        Undo.cancelEdit(!!revert);
        return true;
    }

    function runEnvironmentUndo(labelKey, callback) {
        finishEnvironmentUndo();
        beginEnvironmentUndo(labelKey);
        try {
            const beforeSettings = JSON.stringify(settings);
            const beforePresets = serializeEnvironmentPresetRegistry();
            const result = callback();
            if (beforeSettings !== JSON.stringify(settings) || beforePresets !== serializeEnvironmentPresetRegistry()) {
                markEnvironmentUndoChanged();
            }
            finishEnvironmentUndo();
            return result;
        } catch (error) {
            cancelEnvironmentUndo(true);
            throw error;
        }
    }

    function registerEnvironmentUndoHooks() {
        if (environmentUndoHooks || typeof Blockbench === 'undefined') return environmentUndoHooks;
        const createSaveEvent = Blockbench.on('create_undo_save', event => {
            if (!event?.aspects?.[ENVIRONMENT_UNDO_ASPECT] || !event.save) return;
            event.save[PROJECT_PROPERTY] = JSON.stringify(settings);
            event.save[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
        });
        const loadSaveEvent = Blockbench.on('load_undo_save', event => {
            if (!event?.save || event.save[PROJECT_PROPERTY] === undefined) return;
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(event.save[PROJECT_PROPERTY])));
                if (typeof Project !== 'undefined' && Project) {
                    Project[PROJECT_PROPERTY] = event.save[PROJECT_PROPERTY];
                    Project[PROJECT_PRESETS_PROPERTY] = event.save[PROJECT_PRESETS_PROPERTY] || '';
                    loadEnvironmentPresetRegistry(Project, null, { migrateLegacy: false });
                }
                rebuildEnvironmentPanelForm();
                updateScene({ forceShadow: true });
                dispatchChanged('undo');
                requestPreviewRender();
            } catch (error) {
                console.warn('[Lightflow Environment] Could not restore an environment undo state.', error);
            }
        });
        environmentUndoHooks = {
            delete() {
                createSaveEvent?.delete?.();
                loadSaveEvent?.delete?.();
                environmentUndoHooks = null;
            }
        };
        deletables.push(environmentUndoHooks);
        return environmentUndoHooks;
    }

    function normalizeHex(value, fallback) {
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        return match ? '#' + match[1].toLowerCase() : fallback;
    }


    function makeSkyGradient(ground, horizon, zenith, options = {}) {
        const id = options.id || 'sky';
        return {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION,
            color_space: options.color_space || 'oklab',
            interpolation: options.interpolation || 'smooth',
            stops: [
                { id: `${id}_ground`, position: 0, color: normalizeHex(ground, '#536b78'), midpoint: 0.5 },
                { id: `${id}_horizon`, position: SKY_HORIZON_POSITION, color: normalizeHex(horizon, '#bdd6ff'), midpoint: 0.5 },
                { id: `${id}_zenith`, position: 1, color: normalizeHex(zenith, '#79a7ff'), midpoint: 0.5 }
            ]
        };
    }

    function isFullSkyGradient(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.domain === 'full_sky' || Number(value.version) >= SKY_GRADIENT_VERSION) return true;
        const stops = Array.isArray(value.stops) ? value.stops : [];
        const firstId = String(stops[0]?.id || '').toLowerCase();
        return /ground|nadir|lower/.test(firstId);
    }

    function upgradeLegacySkyGradient(value, fallback, legacyGround) {
        if (!value || typeof value !== 'object') return fallback;
        if (isFullSkyGradient(value)) return value;
        const sourceStops = Array.isArray(value.stops) ? value.stops : [];
        if (!sourceStops.length) return fallback;
        const firstId = String(sourceStops[0]?.id || 'sky').replace(/_(horizon|zenith|middle).*$/i, '') || 'sky';
        const upgradedStops = [{
            id: `${firstId}_ground`,
            position: 0,
            color: normalizeHex(legacyGround, fallback?.stops?.[0]?.color || '#536b78'),
            midpoint: 0.5
        }];
        sourceStops.forEach((stop, index) => {
            upgradedStops.push({
                id: typeof stop?.id === 'string' && stop.id ? stop.id : `${firstId}_legacy_${index}`,
                position: SKY_HORIZON_POSITION + clamp(finite(stop?.position, index / Math.max(1, sourceStops.length - 1)), 0, 1) * (1 - SKY_HORIZON_POSITION),
                color: normalizeHex(stop?.color, index ? '#79a7ff' : '#bdd6ff'),
                midpoint: clamp(finite(stop?.midpoint, 0.5), 0.05, 0.95)
            });
        });
        return {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION,
            color_space: value.color_space,
            interpolation: value.interpolation,
            stops: upgradedStops
        };
    }

    function normalizeEnvironmentGradient(value, fallback, legacyGround) {
        const prepared = upgradeLegacySkyGradient(value, fallback, legacyGround);
        const gradientApi = window.LightManagerUI?.gradient;
        let normalized;
        if (gradientApi?.normalize) {
            normalized = gradientApi.normalize(prepared, {
                fallback,
                min_stops: 3,
                max_stops: SKY_GRADIENT_MAX_STOPS,
                lock_endpoints: true
            });
        } else {
            const input = prepared && typeof prepared === 'object' ? prepared : fallback;
            const stops = (Array.isArray(input?.stops) ? input.stops : fallback.stops)
                .slice(0, SKY_GRADIENT_MAX_STOPS)
                .map((stop, index, source) => ({
                    id: typeof stop?.id === 'string' && stop.id ? stop.id : `sky_stop_${index}`,
                    position: clamp(finite(stop?.position, source.length <= 1 ? 0 : index / (source.length - 1)), 0, 1),
                    color: normalizeHex(stop?.color, index ? '#79a7ff' : '#536b78'),
                    midpoint: clamp(finite(stop?.midpoint, 0.5), 0.05, 0.95)
                }))
                .sort((a, b) => a.position - b.position);
            while (stops.length < 3) {
                const position = stops.length === 0 ? 0 : (stops.length === 1 ? SKY_HORIZON_POSITION : 1);
                stops.push({ id: `sky_stop_${stops.length}`, position, color: stops[0]?.color || '#ffffff', midpoint: 0.5 });
            }
            stops[0].position = 0;
            stops[stops.length - 1].position = 1;
            normalized = {
                color_space: ['oklab', 'srgb', 'linear_rgb', 'hsl'].includes(input?.color_space) ? input.color_space : 'oklab',
                interpolation: ['linear', 'smooth', 'quadratic', 'hard'].includes(input?.interpolation) ? input.interpolation : 'smooth',
                stops
            };
        }
        return Object.assign({}, normalized, {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION
        });
    }

    function gradientEndpoint(gradient, end, fallback) {
        const stops = Array.isArray(gradient?.stops) ? gradient.stops : [];
        const stop = end === 'last' ? stops[stops.length - 1] : stops[0];
        return normalizeHex(stop?.color, fallback);
    }

    function rgbArrayToHex(color, fallback = '#ffffff') {
        if (!Array.isArray(color) || color.length < 3) return fallback;
        const channels = color.slice(0, 3).map(channel => Math.round(clamp(Number(channel) || 0, 0, 1) * 255));
        return '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('');
    }

    function sampleGradient(gradient, position) {
        const gradientApi = window.LightManagerUI?.gradient;
        if (gradientApi?.sample) {
            return gradientApi.sample(gradient, position, {
                min_stops: 3,
                max_stops: SKY_GRADIENT_MAX_STOPS,
                lock_endpoints: true
            });
        }
        const stops = gradient?.stops || [];
        if (!stops.length) return [1, 1, 1];
        const t = clamp(position, 0, 1);
        if (t <= stops[0].position) return hexToRgb(stops[0].color);
        if (t >= stops[stops.length - 1].position) return hexToRgb(stops[stops.length - 1].color);
        let index = 0;
        while (index < stops.length - 2 && t > stops[index + 1].position) index += 1;
        const from = stops[index];
        const to = stops[index + 1];
        const amount = (t - from.position) / Math.max(1e-6, to.position - from.position);
        return mixColor(hexToRgb(from.color), hexToRgb(to.color), amount);
    }

    function makePresetSkyGradient(preset, phase, id) {
        if (phase === 'day') {
            return makeSkyGradient(preset.ground, preset.horizon, preset.zenith, { id, color_space: 'srgb', interpolation: 'linear' });
        }
        if (phase === 'sunrise') {
            return makeSkyGradient(
                preset.sunrise_ground || preset.ground,
                preset.sunrise_horizon,
                preset.sunrise_zenith,
                { id, color_space: 'srgb', interpolation: 'linear' }
            );
        }
        return makeSkyGradient(
            preset.night_ground || '#0a0c16',
            preset.night_horizon,
            preset.night_zenith,
            { id, color_space: 'srgb', interpolation: 'linear' }
        );
    }

    function getPresetSkyGradientProfiles() {
        if (settings.sky_cycle_mode === 'reference' && !getDimensionAtmosphere()) {
            const build = (time, id) => {
                const frame = getReferenceCycleFrame(time, true);
                if (!frame) return null;
                return {
                    version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                    color_space: 'srgb', interpolation: 'smooth',
                    stops: ['ground','horizon','middle','zenith'].map((key,index)=>({
                        id: `${id}_${key}`,position:[0,.5,.74,1][index],color:rgbArrayToHex(frame[key]),midpoint:.5
                    }))
                };
            };
            return {
                day: build(6000, 'day'), sunrise: build(23500, 'sunrise'),
                sunset: build(12500, 'sunset'), night: build(18000, 'night')
            };
        }
        const presetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
        if (presetSkyGradientProfileCache.has(presetId)) return presetSkyGradientProfileCache.get(presetId);
        const preset = PRESETS[presetId];
        const profiles = {
            day: normalizeEnvironmentGradient(preset.day_sky_gradient, makePresetSkyGradient(preset, 'day', `${presetId}_day`), preset.ground),
            sunrise: normalizeEnvironmentGradient(preset.sunrise_sky_gradient, makePresetSkyGradient(preset, 'sunrise', `${presetId}_sunrise`), preset.sunrise_ground || preset.ground),
            sunset: normalizeEnvironmentGradient(preset.sunset_sky_gradient || preset.sunrise_sky_gradient,
                makePresetSkyGradient(preset, 'sunrise', `${presetId}_sunset`), preset.sunrise_ground || preset.ground),
            night: normalizeEnvironmentGradient(preset.night_sky_gradient, makePresetSkyGradient(preset, 'night', `${presetId}_night`), preset.night_ground || '#0a0c16')
        };
        presetSkyGradientProfileCache.set(presetId, profiles);
        return profiles;
    }

    function getSkyGradientProfiles() {
        if (settings.palette_mode === 'custom') {
            return {
                day: settings.day_sky_gradient,
                sunrise: settings.sunrise_sky_gradient,
                sunset: settings.sunset_sky_gradient || settings.sunrise_sky_gradient,
                night: settings.night_sky_gradient
            };
        }
        return getPresetSkyGradientProfiles();
    }

    function getTwilightSkyProfileKey(time = settings.time) {
        const tick = mod(finite(time, 0), 24000);
        // Dawn spans late night -> morning, dusk spans afternoon -> night.
        // The boundary is noon/midnight, where twilight influence is zero.
        return tick >= 6000 && tick < 18000 ? 'sunset' : 'sunrise';
    }

    function getCustomSkyReferenceBlend(time = settings.time) {
        return settings.palette_mode === 'custom' && settings.sky_custom_reference_match &&
            !settings.sky_time_gradients_enabled && settings.sky_cycle_mode === 'reference' &&
            !getDimensionAtmosphere()
            ? getSkyTimeGradientBlend(time, SKY_REFERENCE_CUSTOM_ANCHORS) : null;
    }

    function sampleCustomSkyReferenceColor(position, frame, blend, profiles, defaults) {
        const native = sampleReferenceSkyColor(position, frame);
        if (!native || !blend) return native;
        const fromKey = blend.left.phase, toKey = blend.right.phase;
        const left = sampleGradient(profiles[fromKey], position);
        const right = sampleGradient(profiles[toKey], position);
        const referenceLeft = sampleGradient(defaults[fromKey], position);
        const referenceRight = sampleGradient(defaults[toKey], position);
        return native.map((value, index) => clamp(value +
            (left[index] - referenceLeft[index]) * (1 - blend.amount) +
            (right[index] - referenceRight[index]) * blend.amount, 0, 1));
    }

    function getSkyTimeGradientBlend(time = settings.time, frames = settings.sky_time_gradients) {
        if (!Array.isArray(frames) || frames.length < 2) return null;
        const tick = mod(finite(time, 0), 24000);
        const rightIndex = frames.findIndex(frame => frame.time > tick);
        const right = rightIndex < 0 ? frames[0] : frames[rightIndex];
        const left = frames[rightIndex <= 0 ? frames.length - 1 : rightIndex - 1];
        const end = right.time <= left.time ? right.time + 24000 : right.time;
        const now = tick < left.time ? tick + 24000 : tick;
        const fraction = clamp((now - left.time) / Math.max(1, end - left.time), 0, 1);
        return {left, right, amount: fraction * fraction * (3 - 2 * fraction)};
    }

    function sampleSkyTimeGradient(position, time = settings.time, frames = settings.sky_time_gradients) {
        const blend = getSkyTimeGradientBlend(time, frames);
        if (!blend) return null;
        return mixColor(sampleGradient(blend.left.gradient, position),
            sampleGradient(blend.right.gradient, position), blend.amount);
    }

    function makeSkyTimeGradient(time, colorAtPosition) {
        return {
            id: `clock_${time}`,
            time,
            gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'srgb', interpolation: 'smooth',
                stops: ['ground', 'horizon', 'middle', 'zenith'].map((label, index) => ({
                    id: `clock_${time}_${label}`,
                    position: [0, SKY_HORIZON_POSITION, .74, 1][index],
                    color: rgbArrayToHex(colorAtPosition([0, SKY_HORIZON_POSITION, .74, 1][index])),
                    midpoint: .5
                }))
            }
        };
    }

    function formatSkyClockTime(ticks) {
        // Minecraft 0 ticks = 06:00, 6000 = noon, 12000 = 18:00.
        const totalMinutes = Math.floor(mod(Math.round(ticks) + 6000, 24000) * 1440 / 24000);
        return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    }

    function seedSkyTimeGradients() {
        const profiles = getSkyGradientProfiles();
        // Named phases use their authored palette, never a snapshot outside the
        // preset's twilight peak. Keep stop identities, midpoints and color space.
        return SKY_REFERENCE_CUSTOM_ANCHORS.map(({phase, time}) => ({
            id: `sky_${phase}`, phase, time, gradient: cloneEnvironmentData(profiles[phase])
        }));
    }

    function getSkyTimeAnchor(frame) {
        return SKY_REFERENCE_CUSTOM_ANCHORS.find(anchor => anchor.phase === frame?.phase) || null;
    }

    function ensureSkyTimeAnchors(frames) {
        const result = cloneEnvironmentData(frames);
        const profiles = getSkyGradientProfiles();
        for (const anchor of SKY_REFERENCE_CUSTOM_ANCHORS) {
            const existing = result.find(frame => frame.phase === anchor.phase)
                || result.find(frame => !frame.phase && frame.time === anchor.time);
            if (existing) {
                existing.phase = anchor.phase;
                existing.time = anchor.time;
            } else {
                let id = `sky_${anchor.phase}`;
                let suffix = 1;
                while (result.some(frame => frame.id === id)) id = `sky_${anchor.phase}_${suffix++}`;
                result.push({id, ...anchor, gradient: cloneEnvironmentData(profiles[anchor.phase])});
            }
        }
        return result.sort((a, b) => a.time - b.time);
    }

    function seedCustomSkyPalette(incoming) {
        if (incoming.palette_mode !== 'custom' || settings.palette_mode === 'custom') return;
        // Switching Preset → Custom is a view change, not an implicit reset.
        if (settings.sky_custom_palette_saved) {
            incoming.sky_custom_palette_saved = true;
            return;
        }
        const profiles = getPresetSkyGradientProfiles();
        const preset = PRESETS[settings.preset] || PRESETS.vanilla;
        const defaults = {
            day_sky_gradient: profiles.day,
            sunrise_sky_gradient: profiles.sunrise,
            sunset_sky_gradient: profiles.sunset,
            night_sky_gradient: profiles.night,
            sun_color: preset.sun,
            moon_color: preset.moon,
            cloud_color: preset.cloud
        };
        // Full dialogs include values of hidden fields. Replace the dormant
        // palette only if it was not independently edited in that transaction.
        for (const [key, value] of Object.entries(defaults)) {
            // The full Environment dialog submits its dormant sunset field even
            // in preset mode. When the previous project has no separate sunset,
            // its shared sunrise value is not an intentional sunset override.
            const sharedLegacySunset = key === 'sunset_sky_gradient' && !settings.sunset_sky_gradient &&
                JSON.stringify(incoming[key]) === JSON.stringify(settings.sunrise_sky_gradient);
            if (!Object.prototype.hasOwnProperty.call(incoming, key) ||
                JSON.stringify(incoming[key]) === JSON.stringify(settings[key]) || sharedLegacySunset) {
                incoming[key] = cloneEnvironmentData(value);
            }
        }
        incoming.sky_custom_palette_saved = true;
        incoming.sky_custom_reference_match = settings.sky_cycle_mode === 'reference';
    }

    function sampleCurrentSkyColor(position, daylight, twilight, applyIntensity = true) {
        const reference = sampleReferenceSkyColor(clamp(position, 0, 1));
        if (reference) return applyIntensity ? multiplyColor(reference, settings.sky_intensity) : reference;
        const timed = settings.palette_mode === 'custom' && settings.sky_time_gradients_enabled
            ? sampleSkyTimeGradient(clamp(position, 0, 1)) : null;
        if (timed) return applyIntensity ? multiplyColor(timed, settings.sky_intensity) : timed;
        const referenceBlend = getCustomSkyReferenceBlend();
        if (referenceBlend) {
            const adjusted = sampleCustomSkyReferenceColor(clamp(position, 0, 1),
                getReferenceCycleFrame(settings.time, true), referenceBlend,
                getSkyGradientProfiles(), getPresetSkyGradientProfiles());
            if (adjusted) return applyIntensity ? multiplyColor(adjusted, settings.sky_intensity) : adjusted;
        }
        const profiles = getSkyGradientProfiles();
        const t = clamp(position, 0, 1);
        let color = mixColor(sampleGradient(profiles.night, t), sampleGradient(profiles.day, t), daylight);
        const horizonDistance = Math.abs(t - SKY_HORIZON_POSITION) / SKY_HORIZON_POSITION;
        const twilightAmount = twilight * (1 - 0.38 * clamp(horizonDistance, 0, 1));
        color = mixColor(color, sampleGradient(profiles[getTwilightSkyProfileKey()], t), twilightAmount);
        return applyIntensity ? multiplyColor(color, settings.sky_intensity) : color;
    }

    function ensureSkyGradientTexture() {
        if (skyGradientTexture || !window.THREE) return skyGradientTexture;
        skyGradientTextureData = new Uint8Array(SKY_GRADIENT_TEXTURE_SIZE * 4);
        skyGradientTexture = new THREE.DataTexture(
            skyGradientTextureData,
            SKY_GRADIENT_TEXTURE_SIZE,
            1,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        skyGradientTexture.name = 'Lightflow Environment Sky Gradient';
        skyGradientTexture.wrapS = THREE.ClampToEdgeWrapping;
        skyGradientTexture.wrapT = THREE.ClampToEdgeWrapping;
        skyGradientTexture.minFilter = THREE.LinearFilter;
        skyGradientTexture.magFilter = THREE.LinearFilter;
        skyGradientTexture.generateMipmaps = false;
        skyGradientTexture.flipY = false;
        skyGradientTexture.unpackAlignment = 1;
        skyGradientTexture.needsUpdate = true;
        return skyGradientTexture;
    }

    function updateSkyGradientTexture(state) {
        const texture = ensureSkyGradientTexture();
        if (!texture || !skyGradientTextureData) return;
        const cycleFrame = getReferenceCycleFrame();
        const dimension = getDimensionAtmosphere();
        if (cycleFrame || dimension) {
            const signature = JSON.stringify([settings.preset,settings.dimension,cycleFrame]);
            if (signature === lastSkyGradientSignature) return;
            lastSkyGradientSignature = signature;
            for (let index=0; index<SKY_GRADIENT_TEXTURE_SIZE; index++) {
                const color = sampleReferenceSkyColor(index/(SKY_GRADIENT_TEXTURE_SIZE-1),cycleFrame);
                for (let channel=0; channel<3; channel++) skyGradientTextureData[index*4+channel] = Math.round(clamp(color[channel],0,1)*255);
                skyGradientTextureData[index*4+3] = 255;
            }
            texture.needsUpdate = true;
            return;
        }
        const timedBlend = settings.palette_mode === 'custom' && settings.sky_time_gradients_enabled
            ? getSkyTimeGradientBlend() : null;
        if (timedBlend) {
            const frames = settings.sky_time_gradients;
            const sampler = window.LightManagerUI?.gradient?.sample || null;
            const frameSignature = JSON.stringify(frames);
            const signature = `${frameSignature}|${sampler ? 'api' : 'fallback'}|${Math.round(settings.time * 100) / 100}`;
            if (signature === lastSkyGradientSignature && skyGradientSamples?.sampler === sampler) return;
            if (skyGradientSamples?.signature !== frameSignature || skyGradientSamples?.sampler !== sampler) {
                const frameSamples = frames.map(frame => {
                    const samples = new Float64Array(SKY_GRADIENT_TEXTURE_SIZE * 3);
                    for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++)
                        samples.set(sampleGradient(frame.gradient, index / (SKY_GRADIENT_TEXTURE_SIZE - 1)), index * 3);
                    return samples;
                });
                skyGradientSamples = { signature: frameSignature, sampler, frames: frameSamples };
            }
            lastSkyGradientSignature = signature;
            const left = skyGradientSamples.frames[frames.indexOf(timedBlend.left)];
            const right = skyGradientSamples.frames[frames.indexOf(timedBlend.right)];
            for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
                for (let channel = 0; channel < 3; channel++) {
                    const offset = index * 3 + channel;
                    skyGradientTextureData[index * 4 + channel] = Math.round(clamp(
                        left[offset] + (right[offset] - left[offset]) * timedBlend.amount, 0, 1) * 255);
                }
                skyGradientTextureData[index * 4 + 3] = 255;
            }
            texture.needsUpdate = true;
            return;
        }
        const referenceBlend = getCustomSkyReferenceBlend();
        if (referenceBlend) {
            const referenceFrame = getReferenceCycleFrame(settings.time, true);
            if (referenceFrame) {
                const profiles = getSkyGradientProfiles();
                const defaults = getPresetSkyGradientProfiles();
                const sampler = window.LightManagerUI?.gradient?.sample || null;
                const profileSignature = JSON.stringify([profiles, defaults]);
                const signature = JSON.stringify(['custom-reference', settings.time,
                    profileSignature, sampler ? 'api' : 'fallback']);
                if (signature === lastSkyGradientSignature && skyGradientSamples?.sampler === sampler) return;
                if (skyGradientSamples?.signature !== profileSignature || skyGradientSamples?.sampler !== sampler) {
                    const deltas = {};
                    for (const phase of ['day', 'sunset', 'night', 'sunrise']) {
                        const samples = new Float64Array(SKY_GRADIENT_TEXTURE_SIZE * 3);
                        for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
                            const position = index / (SKY_GRADIENT_TEXTURE_SIZE - 1);
                            const authored = sampleGradient(profiles[phase], position);
                            const original = sampleGradient(defaults[phase], position);
                            for (let channel = 0; channel < 3; channel++)
                                samples[index * 3 + channel] = authored[channel] - original[channel];
                        }
                        deltas[phase] = samples;
                    }
                    skyGradientSamples = {signature: profileSignature, sampler, deltas};
                }
                lastSkyGradientSignature = signature;
                const left = skyGradientSamples.deltas[referenceBlend.left.phase];
                const right = skyGradientSamples.deltas[referenceBlend.right.phase];
                for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
                    const native = sampleReferenceSkyColor(index / (SKY_GRADIENT_TEXTURE_SIZE - 1), referenceFrame);
                    for (let channel = 0; channel < 3; channel++) {
                        const offset = index * 3 + channel;
                        const color = native[channel] + left[offset] * (1 - referenceBlend.amount) +
                            right[offset] * referenceBlend.amount;
                        skyGradientTextureData[index * 4 + channel] = Math.round(clamp(color, 0, 1) * 255);
                    }
                    skyGradientTextureData[index * 4 + 3] = 255;
                }
                texture.needsUpdate = true;
                return;
            }
        }
        const profiles = getSkyGradientProfiles();
        const profileSignature = JSON.stringify(profiles);
        const sampler = window.LightManagerUI?.gradient?.sample || null;
        const profilesChanged = !skyGradientSamples ||
            skyGradientSamples.signature !== profileSignature ||
            skyGradientSamples.sampler !== sampler;
        const signature = [
            Math.round(state.daylight * 10000),
            Math.round(state.twilight * 10000),
            settings.palette_mode,
            settings.preset,
            getTwilightSkyProfileKey(),
            profileSignature
        ].join('|');
        if (!profilesChanged && signature === lastSkyGradientSignature) return;
        if (profilesChanged) {
            // Gradient interpolation includes color-space conversion and stop
            // normalization. Time changes the weights between four phase
            // profiles, so sample each profile only when its content changes.
            skyGradientSamples = { signature: profileSignature, sampler };
            for (const phase of ['night', 'day', 'sunrise', 'sunset']) {
                const samples = new Float64Array(SKY_GRADIENT_TEXTURE_SIZE * 3);
                for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
                    const color = sampleGradient(profiles[phase], index / (SKY_GRADIENT_TEXTURE_SIZE - 1));
                    samples.set(color, index * 3);
                }
                skyGradientSamples[phase] = samples;
            }
        }
        lastSkyGradientSignature = signature;
        const daylight = clamp(state.daylight, 0, 1);
        const twilightPhase = skyGradientSamples[getTwilightSkyProfileKey()];
        for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
            const position = index / (SKY_GRADIENT_TEXTURE_SIZE - 1);
            const horizonDistance = Math.abs(position - SKY_HORIZON_POSITION) / SKY_HORIZON_POSITION;
            const twilight = clamp(state.twilight * (1 - 0.38 * clamp(horizonDistance, 0, 1)), 0, 1);
            const offset = index * 4;
            for (let channel = 0; channel < 3; channel++) {
                const sampleIndex = index * 3 + channel;
                const night = skyGradientSamples.night[sampleIndex];
                const day = skyGradientSamples.day[sampleIndex];
                const twilightColor = twilightPhase[sampleIndex];
                const base = night + (day - night) * daylight;
                const color = base + (twilightColor - base) * twilight;
                skyGradientTextureData[offset + channel] = Math.round(clamp(color, 0, 1) * 255);
            }
            skyGradientTextureData[offset + 3] = 255;
        }
        texture.needsUpdate = true;
    }


    function normalizeSettings(source) {
        const result = Object.assign({}, DEFAULT_SETTINGS, source || {});
        result.enabled = result.enabled !== false;
        result.preset = PRESETS[result.preset] ? result.preset : 'vanilla';
        result.dimension = Object.prototype.hasOwnProperty.call(DIMENSION_ATMOSPHERES, result.dimension) ? result.dimension : 'overworld';
        result.dimension_fog_mode = result.dimension_fog_mode === 'custom' ? 'custom' : 'preset';
        result.sky_cycle_mode = result.sky_cycle_mode === 'legacy' ? 'legacy' : 'reference';
        result.sky_time_gradients_enabled = !!result.sky_time_gradients_enabled;
        result.time = mod(finite(result.time, 6000), 24000);
        result.animate_time = !!result.animate_time;
        result.day_length_seconds = clamp(finite(result.day_length_seconds, 120), 10, 3600);
        result.sun_azimuth = mod(finite(result.sun_azimuth, 0), 360);
        result.palette_mode = result.palette_mode === 'custom' ? 'custom' : 'preset';
        // Read older projects before these fields existed. A custom palette
        // already authored in the project must never be silently re-seeded.
        const sourceSettings = source && typeof source === 'object' ? source : {};
        // An active custom palette is already authored, even if an older save
        // serialized the default false flag. Preserve it on Preset → Custom.
        result.sky_custom_palette_saved = result.palette_mode === 'custom' ||
            (sourceSettings.sky_custom_palette_saved === undefined
                ? !!sourceSettings.sunset_sky_gradient
                : !!sourceSettings.sky_custom_palette_saved);
        result.sky_custom_reference_match = sourceSettings.sky_custom_reference_match === undefined
            ? result.sky_cycle_mode === 'reference' &&
                !!sourceSettings.sunset_sky_gradient
            : !!sourceSettings.sky_custom_reference_match;
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
        const dayGradientFallback = makeSkyGradient(
            sourceSettings.ground_color || result.ground_color,
            sourceSettings.horizon_color || result.horizon_color,
            sourceSettings.zenith_color || result.zenith_color,
            { id: 'day', color_space: 'oklab', interpolation: 'smooth' }
        );
        const sunriseGradientFallback = makeSkyGradient(
            sourceSettings.sunrise_ground_color || sourceSettings.ground_color || '#6a5973',
            sourceSettings.sunrise_horizon_color || result.sunrise_horizon_color,
            sourceSettings.sunrise_zenith_color || result.sunrise_zenith_color,
            { id: 'sunrise', color_space: 'oklab', interpolation: 'smooth' }
        );
        const nightGradientFallback = makeSkyGradient(
            sourceSettings.night_ground_color || '#0a0c16',
            sourceSettings.night_horizon_color || result.night_horizon_color,
            sourceSettings.night_zenith_color || result.night_zenith_color,
            { id: 'night', color_space: 'oklab', interpolation: 'smooth' }
        );
        result.day_sky_gradient = normalizeEnvironmentGradient(sourceSettings.day_sky_gradient, dayGradientFallback, sourceSettings.ground_color || result.ground_color);
        result.sunrise_sky_gradient = normalizeEnvironmentGradient(sourceSettings.sunrise_sky_gradient, sunriseGradientFallback, sourceSettings.sunrise_ground_color || sourceSettings.ground_color || '#6a5973');
        result.sunset_sky_gradient = sourceSettings.sunset_sky_gradient
            ? normalizeEnvironmentGradient(sourceSettings.sunset_sky_gradient, result.sunrise_sky_gradient,
                sourceSettings.sunrise_ground_color || sourceSettings.ground_color || '#6a5973')
            : null;
        result.night_sky_gradient = normalizeEnvironmentGradient(sourceSettings.night_sky_gradient, nightGradientFallback, sourceSettings.night_ground_color || '#0a0c16');
        const validTimeFrames = Array.isArray(sourceSettings.sky_time_gradients) ? sourceSettings.sky_time_gradients : [];
        const seenFrameTimes = new Set();
        // Legacy projects may already contain 24 authored moments. Adding the four
        // fixed phases must not discard them; new creation still stops at 24.
        const fixedCount = new Set(validTimeFrames.map(frame => getSkyTimeAnchor(frame)?.phase).filter(Boolean)).size;
        result.sky_time_gradients = validTimeFrames.slice(0, SKY_TIME_GRADIENT_MAX_FRAMES + fixedCount).reduce((frames, frame) => {
            if (!frame || typeof frame !== 'object' || !Number.isFinite(Number(frame.time))) return frames;
            const anchor = getSkyTimeAnchor(frame);
            const time = anchor ? anchor.time : Math.round(clamp(Number(frame.time), 0, 23999));
            if (seenFrameTimes.has(time)) return frames;
            seenFrameTimes.add(time);
            frames.push({
                id: typeof frame.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(frame.id) ? frame.id : `clock_${time}`,
                ...(anchor ? {phase: anchor.phase} : {}),
                time, gradient: normalizeEnvironmentGradient(frame.gradient, result.day_sky_gradient, result.ground_color)
            });
            return frames;
        }, []).sort((a, b) => a.time - b.time);
        result.ground_color = rgbArrayToHex(sampleGradient(result.day_sky_gradient, 0), result.ground_color);
        result.horizon_color = rgbArrayToHex(sampleGradient(result.day_sky_gradient, SKY_HORIZON_POSITION), result.horizon_color);
        result.zenith_color = gradientEndpoint(result.day_sky_gradient, 'last', result.zenith_color);
        result.sunrise_horizon_color = rgbArrayToHex(sampleGradient(result.sunrise_sky_gradient, SKY_HORIZON_POSITION), result.sunrise_horizon_color);
        result.sunrise_zenith_color = gradientEndpoint(result.sunrise_sky_gradient, 'last', result.sunrise_zenith_color);
        result.night_horizon_color = rgbArrayToHex(sampleGradient(result.night_sky_gradient, SKY_HORIZON_POSITION), result.night_horizon_color);
        result.night_zenith_color = gradientEndpoint(result.night_sky_gradient, 'last', result.night_zenith_color);
        result.sky_intensity = clamp(finite(result.sky_intensity, 1), 0, 4);
        result.sky_gradient_power = clamp(finite(result.sky_gradient_power, 2.3), 0.5, 8);
        result.star_density = clamp(finite(result.star_density, 1), 0.1, 4);
        result.environment_strength = clamp(finite(result.environment_strength, 0.75), 0, 4);
        result.ambient_fill_color_mode = result.ambient_fill_color_mode === 'custom' ? 'custom' : 'sky';
        result.ambient_fill_shape = ['preset', 'flat', 'hemisphere'].includes(result.ambient_fill_shape)
            ? result.ambient_fill_shape : 'preset';
        result.ambient_fill_sky_color = normalizeHex(result.ambient_fill_sky_color, DEFAULT_SETTINGS.ambient_fill_sky_color);
        result.ambient_fill_ground_color = normalizeHex(result.ambient_fill_ground_color, DEFAULT_SETTINGS.ambient_fill_ground_color);
        result.ambient_fill_day_multiplier = clamp(finite(result.ambient_fill_day_multiplier, 1), 0, 4);
        result.ambient_fill_night_multiplier = clamp(finite(result.ambient_fill_night_multiplier, 1), 0, 4);
        result.distance_fog_enabled = !!result.distance_fog_enabled;
        result.distance_fog_color_mode = ['sky', 'time', 'fixed'].includes(result.distance_fog_color_mode)
            ? result.distance_fog_color_mode
            : 'sky';
        result.distance_fog_fixed_color = normalizeHex(result.distance_fog_fixed_color, DEFAULT_SETTINGS.distance_fog_fixed_color);
        result.distance_fog_near_color = normalizeHex(result.distance_fog_near_color, DEFAULT_SETTINGS.distance_fog_near_color);
        result.distance_fog_day_color = normalizeHex(result.distance_fog_day_color, DEFAULT_SETTINGS.distance_fog_day_color);
        result.distance_fog_sunrise_color = normalizeHex(result.distance_fog_sunrise_color, DEFAULT_SETTINGS.distance_fog_sunrise_color);
        result.distance_fog_night_color = normalizeHex(result.distance_fog_night_color, DEFAULT_SETTINGS.distance_fog_night_color);
        result.distance_fog_start = Math.max(0, finite(result.distance_fog_start, DEFAULT_SETTINGS.distance_fog_start));
        result.distance_fog_end = Math.max(result.distance_fog_start + 0.001, finite(result.distance_fog_end, DEFAULT_SETTINGS.distance_fog_end));
        result.distance_fog_smoothness = clamp(finite(result.distance_fog_smoothness, DEFAULT_SETTINGS.distance_fog_smoothness), 0, 1);
        result.distance_fog_curve = clamp(finite(result.distance_fog_curve, 1), 0.25, 4);
        result.distance_fog_sky_blend = clamp(finite(result.distance_fog_sky_blend, 0), 0, 1);
        result.distance_fog_noise = clamp(finite(result.distance_fog_noise, 0), 0, 1);
        result.distance_fog_noise_scale = clamp(finite(result.distance_fog_noise_scale, 24), 0.25, 4096);
        result.distance_fog_gradient = clamp(finite(result.distance_fog_gradient, DEFAULT_SETTINGS.distance_fog_gradient), 0, 1);
        result.distance_fog_dither = clamp(finite(result.distance_fog_dither, DEFAULT_SETTINGS.distance_fog_dither), 0, 1);
        result.distance_fog_max_opacity = clamp(finite(result.distance_fog_max_opacity, DEFAULT_SETTINGS.distance_fog_max_opacity), 0, 1);
        result.distance_fog_sync_background = result.distance_fog_sync_background !== false;
        result.distance_grade_enabled = !!result.distance_grade_enabled;
        result.distance_grade_follow_fog = !!result.distance_grade_follow_fog;
        result.distance_grade_curve = clamp(finite(result.distance_grade_curve, 1), 0.25, 4);
        result.distance_grade_pivot = clamp(finite(result.distance_grade_pivot, 0.5), 0, 1);
        result.distance_grade_pivot_mode = result.distance_grade_pivot_mode === 'sky' ? 'sky' : 'fixed';
        result.distance_grade_tint_mode = result.distance_grade_tint_mode === 'sky' ? 'sky' : 'fixed';
        result.distance_grade_start = Math.max(0, finite(result.distance_grade_start, DEFAULT_SETTINGS.distance_grade_start));
        result.distance_grade_end = Math.max(result.distance_grade_start + 0.001, finite(result.distance_grade_end, DEFAULT_SETTINGS.distance_grade_end));
        result.distance_grade_saturation = clamp(finite(result.distance_grade_saturation, DEFAULT_SETTINGS.distance_grade_saturation), 0, 2);
        result.distance_grade_contrast = clamp(finite(result.distance_grade_contrast, DEFAULT_SETTINGS.distance_grade_contrast), 0, 2);
        result.distance_grade_tint = normalizeHex(result.distance_grade_tint, DEFAULT_SETTINGS.distance_grade_tint);
        result.distance_grade_tint_strength = clamp(finite(result.distance_grade_tint_strength, DEFAULT_SETTINGS.distance_grade_tint_strength), 0, 1);
        result.sun_enabled = result.sun_enabled !== false;
        result.sun_intensity = clamp(finite(result.sun_intensity, 2.2), 0, 20);
        result.sun_light_color_mode = result.sun_light_color_mode === 'time' ? 'time' : 'sun';
        result.sun_light_day_color = normalizeHex(result.sun_light_day_color, DEFAULT_SETTINGS.sun_light_day_color);
        result.sun_light_twilight_color = normalizeHex(result.sun_light_twilight_color, DEFAULT_SETTINGS.sun_light_twilight_color);
        result.moon_intensity = clamp(finite(result.moon_intensity, 0.28), 0, 5);
        result.moon_light_color_mode = result.moon_light_color_mode === 'custom' ? 'custom' : 'moon';
        result.moon_light_custom_color = normalizeHex(result.moon_light_custom_color, DEFAULT_SETTINGS.moon_light_custom_color);
        result.celestial_size = clamp(finite(result.celestial_size, 0.055), 0.012, 0.5);
        result.moon_size = clamp(finite(source?.moon_size, result.celestial_size), 0.012, 0.5);
        result.moon_phase = Math.round(clamp(finite(result.moon_phase, 0), 0, 7));
        result.sun_mode = ['vanilla', 'texture', 'hidden'].includes(result.sun_mode) ? result.sun_mode : 'vanilla';
        result.moon_mode = ['vanilla', 'texture', 'hidden'].includes(result.moon_mode) ? result.moon_mode : 'vanilla';
        result.sun_blend_mode = ['preset', 'alpha', 'additive', 'multiply'].includes(result.sun_blend_mode)
            ? result.sun_blend_mode : 'preset';
        result.sun_opacity = clamp(finite(result.sun_opacity, DEFAULT_SETTINGS.sun_opacity), 0, 1);
        result.moon_blend_mode = ['preset', 'alpha', 'additive', 'multiply'].includes(result.moon_blend_mode)
            ? result.moon_blend_mode : 'preset';
        result.moon_opacity = clamp(finite(result.moon_opacity, DEFAULT_SETTINGS.moon_opacity), 0, 1);
        result.sun_texture_uuid = typeof result.sun_texture_uuid === 'string' ? result.sun_texture_uuid : '';
        result.moon_texture_uuid = typeof result.moon_texture_uuid === 'string' ? result.moon_texture_uuid : '';
        result.moon_texture_layout = ['atlas', 'single'].includes(result.moon_texture_layout)
            ? result.moon_texture_layout
            : 'atlas';
        result.moon_atlas_columns = Math.round(clamp(finite(result.moon_atlas_columns, 4), 1, 16));
        result.moon_atlas_rows = Math.round(clamp(finite(result.moon_atlas_rows, 2), 1, 16));
        result.moon_phase_offset = Math.round(clamp(finite(result.moon_phase_offset, 0), -64, 64));
        result.sun_horizon_scale = clamp(finite(result.sun_horizon_scale, 1.34), 1, 2.5);
        result.sun_gaze_scale = clamp(finite(result.sun_gaze_scale, 1.16), 1, 2.5);
        result.sun_glare = clamp(finite(result.sun_glare, 0.25), 0, 3);
        result.sunset_directional_glow = clamp(finite(result.sunset_directional_glow, 1), 0, 3);
        result.environment_bloom_enabled = !!result.environment_bloom_enabled;
        result.bloom_threshold = clamp(finite(result.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        result.bloom_soft_knee = clamp(finite(result.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        result.bloom_strength = clamp(finite(result.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 4);
        result.bloom_core_strength = clamp(finite(result.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 4);
        result.bloom_core_radius = clamp(finite(result.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 8);
        result.bloom_halo_strength = clamp(finite(result.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 4);
        result.bloom_halo_radius = clamp(finite(result.bloom_halo_radius, DEFAULT_SETTINGS.bloom_halo_radius), 1, 64);
        result.bloom_hdr_strength = clamp(finite(result.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 6);
        result.bloom_emissive_strength = clamp(finite(result.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 6);
        result.bloom_occlusion = clamp(finite(result.bloom_occlusion, DEFAULT_SETTINGS.bloom_occlusion), 0, 1);
        result.sun_bloom_contribution = clamp(finite(result.sun_bloom_contribution, DEFAULT_SETTINGS.sun_bloom_contribution), 0, 4);
        result.moon_bloom_contribution = clamp(finite(result.moon_bloom_contribution, DEFAULT_SETTINGS.moon_bloom_contribution), 0, 4);
        result.star_bloom_contribution = clamp(finite(result.star_bloom_contribution, DEFAULT_SETTINGS.star_bloom_contribution), 0, 4);
        result.cloud_bloom_contribution = clamp(finite(result.cloud_bloom_contribution, DEFAULT_SETTINGS.cloud_bloom_contribution), 0, 4);
        result.stars_enabled = result.stars_enabled !== false;
        result.star_brightness = clamp(finite(result.star_brightness, 0.72), 0, 3);
        result.clouds_enabled = result.clouds_enabled !== false;
        result.cloud_mode = ['procedural', 'vanilla', 'texture'].includes(result.cloud_mode) ? result.cloud_mode : 'vanilla';
        result.cloud_style = ['vanilla', 'rendercraft', 'vibrant_visuals'].includes(result.cloud_style) ? result.cloud_style : 'vanilla';
        result.cloud_palette_mode = result.cloud_palette_mode === 'custom' ? 'custom' : 'preset';
        result.cloud_texture_uuid = typeof result.cloud_texture_uuid === 'string' ? result.cloud_texture_uuid : '';
        result.cloud_coverage = clamp(finite(result.cloud_coverage, 0.54), 0, 1);
        result.cloud_opacity = clamp(finite(result.cloud_opacity, 0.78), 0, 1);
        result.cloud_speed = clamp(finite(result.cloud_speed, 0.016), -1, 1);
        result.cloud_paused = !!result.cloud_paused;
        result.cloud_motion_phase = clamp(finite(result.cloud_motion_phase, 0), -1e12, 1e12);
        result.cloud_offset_x = clamp(finite(result.cloud_offset_x, 0), -1000000, 1000000);
        result.cloud_offset_y = clamp(finite(result.cloud_offset_y, 0), -1000000, 1000000);
        result.cloud_scale = clamp(finite(result.cloud_scale, 1), 0.05, 16);
        result.cloud_direction = mod(finite(result.cloud_direction, 0), 360);
        result.cloud_contrast = clamp(finite(result.cloud_contrast, 1), 0.1, 4);
        result.cloud_brightness = clamp(finite(result.cloud_brightness, 1), 0, 4);
        result.cloud_height = clamp(finite(result.cloud_height, DEFAULT_SETTINGS.cloud_height), 8, 1024);
        result.cloud_thickness = clamp(finite(result.cloud_thickness, DEFAULT_SETTINGS.cloud_thickness), 0.25, 128);
        result.cloud_extrusion = clamp(finite(result.cloud_extrusion, DEFAULT_SETTINGS.cloud_extrusion), 0, 1);
        result.cloud_top_color = normalizeHex(result.cloud_top_color, DEFAULT_SETTINGS.cloud_top_color);
        result.cloud_sun_side_color = normalizeHex(result.cloud_sun_side_color, DEFAULT_SETTINGS.cloud_sun_side_color);
        result.cloud_shadow_side_color = normalizeHex(result.cloud_shadow_side_color, DEFAULT_SETTINGS.cloud_shadow_side_color);
        result.cloud_bottom_color = normalizeHex(result.cloud_bottom_color, DEFAULT_SETTINGS.cloud_bottom_color);
        result.cloud_edge_color = normalizeHex(result.cloud_edge_color, DEFAULT_SETTINGS.cloud_edge_color);
        result.cloud_bevel_width = clamp(finite(result.cloud_bevel_width, DEFAULT_SETTINGS.cloud_bevel_width), 0, 0.45);
        result.cloud_bevel_softness = clamp(finite(result.cloud_bevel_softness, DEFAULT_SETTINGS.cloud_bevel_softness), 0, 1);
        result.cloud_bevel_roundness = clamp(finite(result.cloud_bevel_roundness, DEFAULT_SETTINGS.cloud_bevel_roundness), 0, 1);
        result.cloud_bevel_strength = clamp(finite(result.cloud_bevel_strength, DEFAULT_SETTINGS.cloud_bevel_strength), 0, 2);
        result.cloud_bevel_enabled = result.cloud_bevel_enabled !== false;
        result.cloud_scattering_strength = clamp(finite(result.cloud_scattering_strength, DEFAULT_SETTINGS.cloud_scattering_strength), 0, 3);
        result.cloud_gradient_thickness = clamp(finite(result.cloud_gradient_thickness, DEFAULT_SETTINGS.cloud_gradient_thickness), 0, 8);
        result.cloud_gradient_alpha = clamp(finite(result.cloud_gradient_alpha, DEFAULT_SETTINGS.cloud_gradient_alpha), 0, 1);
        result.cloud_view_response = clamp(finite(result.cloud_view_response, DEFAULT_SETTINGS.cloud_view_response), 0, 1);
        result.cloud_edge_hardness = clamp(finite(result.cloud_edge_hardness, DEFAULT_SETTINGS.cloud_edge_hardness), 0, 1);
        result.cloud_scattering_size = clamp(finite(result.cloud_scattering_size, DEFAULT_SETTINGS.cloud_scattering_size), 0.1, 4);
        result.cloud_optical_thickness = clamp(finite(result.cloud_optical_thickness, DEFAULT_SETTINGS.cloud_optical_thickness), 0.05, 4);
        result.cloud_phase_anisotropy = clamp(finite(result.cloud_phase_anisotropy, DEFAULT_SETTINGS.cloud_phase_anisotropy), 0, 0.85);
        result.cloud_density_variation = clamp(finite(result.cloud_density_variation, DEFAULT_SETTINGS.cloud_density_variation), 0, 0.3);
        result.cloud_bevel_smooth = result.cloud_bevel_smooth !== false;
        result.cloud_bevel_distance_fade = result.cloud_bevel_distance_fade !== false;
        result.cloud_bevel_distance_min_scale = clamp(finite(result.cloud_bevel_distance_min_scale, DEFAULT_SETTINGS.cloud_bevel_distance_min_scale), 0.02, 1);
        result.cloud_edge_strength = clamp(finite(result.cloud_edge_strength, DEFAULT_SETTINGS.cloud_edge_strength), 0, 2);
        result.cloud_shadow_bevel_color = normalizeHex(result.cloud_shadow_bevel_color, DEFAULT_SETTINGS.cloud_shadow_bevel_color);
        result.cloud_shadow_bevel_strength = clamp(finite(result.cloud_shadow_bevel_strength, DEFAULT_SETTINGS.cloud_shadow_bevel_strength), 0, 2);
        result.cloud_lighting_mode = ['palette', 'sky', 'mixed'].includes(result.cloud_lighting_mode) ? result.cloud_lighting_mode : 'mixed';
        result.cloud_sky_tint_strength = clamp(finite(result.cloud_sky_tint_strength, DEFAULT_SETTINGS.cloud_sky_tint_strength), 0, 1);
        result.cloud_environment_influence = clamp(finite(result.cloud_environment_influence, DEFAULT_SETTINGS.cloud_environment_influence), 0, 1);
        result.cloud_time_tint_strength = clamp(finite(result.cloud_time_tint_strength, DEFAULT_SETTINGS.cloud_time_tint_strength), 0, 1);
        result.cloud_sun_tint_strength = clamp(finite(result.cloud_sun_tint_strength, DEFAULT_SETTINGS.cloud_sun_tint_strength), 0, 1);
        result.cloud_fog_enabled = result.cloud_fog_enabled !== false;
        result.cloud_fog_color_mode = result.cloud_fog_color_mode === 'custom' ? 'custom' : 'sky';
        result.cloud_fog_color = normalizeHex(result.cloud_fog_color, DEFAULT_SETTINGS.cloud_fog_color);
        result.cloud_fog_strength = clamp(finite(result.cloud_fog_strength, DEFAULT_SETTINGS.cloud_fog_strength), 0, 1);
        result.cloud_fog_start = clamp(finite(result.cloud_fog_start, DEFAULT_SETTINGS.cloud_fog_start), 0, 0.98);
        result.cloud_fog_end = clamp(finite(result.cloud_fog_end, DEFAULT_SETTINGS.cloud_fog_end), result.cloud_fog_start + 0.01, 1);
        result.cloud_density = clamp(finite(result.cloud_density, DEFAULT_SETTINGS.cloud_density), 0.05, 4);
        result.cloud_absorption = clamp(finite(result.cloud_absorption, DEFAULT_SETTINGS.cloud_absorption), 0, 3);
        result.cloud_translucency = clamp(finite(result.cloud_translucency, DEFAULT_SETTINGS.cloud_translucency), 0, 1);
        result.cloud_time_profiles_enabled = !!result.cloud_time_profiles_enabled;
        result.cloud_time_profiles = normalizeCloudTimeProfiles(
            source?.cloud_time_profiles, getBaseCloudAppearance(result));
        result.lens_flare_enabled = !!result.lens_flare_enabled;
        result.lens_flare_strength = clamp(finite(result.lens_flare_strength, DEFAULT_SETTINGS.lens_flare_strength), 0, 2);
        result.lens_flare_scale = clamp(finite(result.lens_flare_scale, DEFAULT_SETTINGS.lens_flare_scale), 0.25, 3);
        result.sun_cast_shadows = result.sun_cast_shadows !== false;
        result.shadow_area = clamp(finite(result.shadow_area, 48), 2, 100000);
        result.shadow_near = clamp(finite(result.shadow_near, 0.1), 0.001, 100000);
        result.shadow_far = Math.max(result.shadow_near + 1, clamp(finite(result.shadow_far, 480), 2, 100000));
        result.shadow_resolution = [256, 512, 1024, 2048, 4096, 8192].includes(Number(result.shadow_resolution))
            ? Number(result.shadow_resolution) : 2048;
        result.studio_shadow_resolution = [0, 256, 512, 1024, 2048, 4096, 8192, 16384].includes(Number(result.studio_shadow_resolution))
            ? Number(result.studio_shadow_resolution) : 0;
        result.shadow_softness = clamp(finite(result.shadow_softness, DEFAULT_SETTINGS.shadow_softness), 0, 8);
        result.shadow_camera_quality = ['off', 'balanced', 'high'].includes(result.shadow_camera_quality) ? result.shadow_camera_quality : 'balanced';
        result.shadow_camera_distance = clamp(finite(result.shadow_camera_distance, 256), 8, 100000);
        result.shadow_softness_mode = ['legacy', 'distance', 'artistic', 'hard'].includes(result.shadow_softness_mode) ? result.shadow_softness_mode : 'hard';
        result.shadow_blur = clamp(finite(result.shadow_blur, DEFAULT_SETTINGS.shadow_blur), 0, 64);
        result.shadow_bias = clamp(finite(result.shadow_bias, -0.00035), -0.1, 0.1);
        result.shadow_normal_bias = clamp(finite(result.shadow_normal_bias, 0.025), 0, 2);
        result.shadow_normal_bias_auto = source.shadow_normal_bias_auto === undefined
            ? Math.abs(result.shadow_normal_bias - 0.025) < 0.000001 : !!source.shadow_normal_bias_auto;
        result.shadow_auto_fit = result.shadow_auto_fit !== false;
        result.shadow_scene_fit = result.shadow_scene_fit !== false;
        result.shadow_region_locked = !!result.shadow_region_locked;
        if (source.shadow_scene_fit === undefined && Array.isArray(source.shadow_fit_corners) && source.shadow_fit_corners.length === 24) {
            result.shadow_scene_fit = false;
            result.shadow_region_locked = true;
        }
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
            console.warn('[Lightflow Environment] Saved settings are invalid; using defaults.', error);
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            if (!storageWriteFailureReported) {
                console.warn('[Lightflow Environment] Settings could not be persisted; the current session remains usable.', error);
                storageWriteFailureReported = true;
            }
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
            ...(PRESETS[settings.preset] || PRESETS.vanilla),
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
            cloud_top: settings.cloud_top_color,
            cloud_sun_side: settings.cloud_sun_side_color,
            cloud_shadow_side: settings.cloud_shadow_side_color,
            cloud_bottom: settings.cloud_bottom_color,
            cloud_edge: settings.cloud_edge_color,
            cloud_shadow_edge: settings.cloud_shadow_bevel_color
        };
    }

    function getCloudPalette(palette = getPalette()) {
        if (settings.cloud_palette_mode === 'custom') {
            return {
                top: settings.cloud_top_color,
                sunSide: settings.cloud_sun_side_color,
                shadowSide: settings.cloud_shadow_side_color,
                bottom: settings.cloud_bottom_color,
                edge: settings.cloud_edge_color,
                shadowEdge: settings.cloud_shadow_bevel_color
            };
        }
        const presetPalette = PRESETS[settings.preset] || palette || PRESETS.vanilla;
        return {
            top: presetPalette.cloud_top || presetPalette.cloud || DEFAULT_SETTINGS.cloud_top_color,
            sunSide: presetPalette.cloud_sun_side || presetPalette.cloud || DEFAULT_SETTINGS.cloud_sun_side_color,
            shadowSide: presetPalette.cloud_shadow_side || presetPalette.cloud || DEFAULT_SETTINGS.cloud_shadow_side_color,
            bottom: presetPalette.cloud_bottom || presetPalette.cloud || DEFAULT_SETTINGS.cloud_bottom_color,
            edge: presetPalette.cloud_edge || presetPalette.cloud || DEFAULT_SETTINGS.cloud_edge_color,
            shadowEdge: presetPalette.cloud_shadow_edge || DEFAULT_SETTINGS.cloud_shadow_bevel_color
        };
    }

    function getBaseCloudAppearance(source = settings) {
        const preset = PRESETS[source.preset] || PRESETS.vanilla;
        const custom = source.cloud_palette_mode === 'custom';
        const colors = {
            cloud_top_color: custom ? source.cloud_top_color : preset.cloud_top || preset.cloud,
            cloud_sun_side_color: custom ? source.cloud_sun_side_color : preset.cloud_sun_side || preset.cloud,
            cloud_shadow_side_color: custom ? source.cloud_shadow_side_color : preset.cloud_shadow_side || preset.cloud,
            cloud_bottom_color: custom ? source.cloud_bottom_color : preset.cloud_bottom || preset.cloud,
            cloud_edge_color: custom ? source.cloud_edge_color : preset.cloud_edge || preset.cloud,
            cloud_shadow_bevel_color: custom ? source.cloud_shadow_bevel_color : preset.cloud_shadow_edge || DEFAULT_SETTINGS.cloud_shadow_bevel_color,
            cloud_fog_color: source.cloud_fog_color
        };
        const appearance = {};
        for (const key of Object.keys(CLOUD_TIME_NUMERIC_FIELDS))
            appearance[key] = source[key] ?? DEFAULT_SETTINGS[key];
        for (const key of CLOUD_TIME_COLOR_FIELDS)
            appearance[key] = normalizeHex(colors[key], DEFAULT_SETTINGS[key]);
        return appearance;
    }

    function normalizeCloudTimeProfiles(profiles, fallback = getBaseCloudAppearance()) {
        if (!Array.isArray(profiles)) return [];
        const seen = new Set();
        return profiles.slice(0, CLOUD_TIME_PROFILE_MAX_FRAMES).reduce((result, frame) => {
            if (!frame || !Number.isFinite(frame.time === null ? NaN : Number(frame.time))) return result;
            const time = Math.round(clamp(Number(frame.time), 0, 23999));
            if (seen.has(time)) return result;
            seen.add(time);
            const value = frame.appearance && typeof frame.appearance === 'object' ? frame.appearance : {};
            const appearance = {};
            for (const [key, bounds] of Object.entries(CLOUD_TIME_NUMERIC_FIELDS))
                appearance[key] = clamp(finite(value[key], fallback[key]), bounds[0], bounds[1]);
            appearance.cloud_fog_end = Math.max(appearance.cloud_fog_start + 0.01, appearance.cloud_fog_end);
            for (const key of CLOUD_TIME_COLOR_FIELDS)
                appearance[key] = normalizeHex(value[key], fallback[key]);
            result.push({
                id: typeof frame.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(frame.id) ? frame.id : `cloud_clock_${time}`,
                time, appearance
            });
            return result;
        }, []).sort((a, b) => a.time - b.time);
    }

    function sampleCloudTimeAppearance(time = settings.time, frames = settings.cloud_time_profiles) {
        const blend = getSkyTimeGradientBlend(time, frames);
        if (!blend) return null;
        const appearance = {};
        for (const key of Object.keys(CLOUD_TIME_NUMERIC_FIELDS)) {
            const from = blend.left.appearance[key];
            appearance[key] = from + (blend.right.appearance[key] - from) * blend.amount;
        }
        for (const key of CLOUD_TIME_COLOR_FIELDS) appearance[key] = rgbArrayToHex(mixColor(
            hexToRgb(blend.left.appearance[key]), hexToRgb(blend.right.appearance[key]), blend.amount));
        return appearance;
    }

    function getEffectiveCloudAppearance() {
        return settings.cloud_time_profiles_enabled && settings.cloud_time_profiles.length >= 2 &&
            settings.clouds_enabled && !getDimensionAtmosphere()
            ? sampleCloudTimeAppearance() : null;
    }

    function seedCloudTimeProfiles() {
        const appearance = getBaseCloudAppearance();
        return [0, 6000, 12000, 18000, 23000].map(time => ({
            id: `cloud_clock_${time}`, time, appearance: cloneEnvironmentData(appearance)
        }));
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

    function configureEnvironmentTexture(texture, options = {}) {
        if (!texture || !window.THREE) return texture;
        const repeat = options.repeat === true;
        texture.name = options.name || texture.name || 'Lightflow Environment Texture';
        texture.flipY = false;
        texture.premultiplyAlpha = false;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    function getProjectTextureImage(texture, sourceMap) {
        return texture?.canvas || texture?.img || texture?.image ||
            sourceMap?.image || sourceMap?.source?.data || null;
    }

    function getBlockbenchTextureMap(uuid, usage = 'celestial') {
        if (!uuid || !window.THREE) return null;
        const texture = window.Texture?.all?.find(candidate => candidate.uuid === uuid || candidate.path === uuid || candidate.source === uuid);
        if (!texture) {
            const source = window.LightManagerUI?.textureSource?.url(uuid);
            if (!source) return null;
            let cached = externalEnvironmentTextures.get(usage);
            if (cached?.source !== source) {
                if (cached) {cached.image.onload=null;cached.image.onerror=null;cached.texture.dispose();projectEnvironmentTextures.delete(cached.texture);}
                const image = new Image();
                const map = configureEnvironmentTexture(new THREE.Texture(image),{name:'Lightflow_'+usage,repeat:usage==='cloud'});
                cached = {source,image,texture:map,loaded:false};
                externalEnvironmentTextures.set(usage,cached);projectEnvironmentTextures.add(map);
                image.onload = () => {
                    if (externalEnvironmentTextures.get(usage)!==cached) return;
                    cached.loaded=true;map.needsUpdate=true;updateScene({forceShadow:false});requestPreviewRender();
                };
                image.onerror = () => {cached.loaded=false;};
                image.src = source;
            }
            return cached.loaded ? cached.texture : null;
        }
        const material = texture.getOwnMaterial?.() || texture.getMaterial?.() || texture.material;
        const sourceMap = material?.map || material?.uniforms?.map?.value || texture.texture || texture.three_texture;
        const image = getProjectTextureImage(texture, sourceMap);
        if (!image) return sourceMap?.isTexture ? sourceMap : null;

        let cachedByUsage = projectTextureCache.get(texture);
        if (!cachedByUsage) {
            cachedByUsage = new Map();
            projectTextureCache.set(texture, cachedByUsage);
        }
        const repeat = usage === 'cloud';
        const sourceStamp = [
            image,
            texture.currentFrame || 0,
            texture.saved === false ? 1 : 0,
            Number(image.width || image.naturalWidth || 0),
            Number(image.height || image.naturalHeight || 0)
        ];
        const cached = cachedByUsage.get(usage);
        if (cached && cached.sourceStamp.every((value, index) => value === sourceStamp[index])) {
            return cached.texture;
        }
        if (cached?.texture) {
            projectEnvironmentTextures.delete(cached.texture);
            cached.texture.dispose?.();
        }

        const environmentTexture = configureEnvironmentTexture(new THREE.Texture(image), {
            name: `Lightflow_${usage}_${texture.name || texture.uuid}`,
            repeat
        });
        cachedByUsage.set(usage, { texture: environmentTexture, sourceStamp });
        projectEnvironmentTextures.add(environmentTexture);
        return environmentTexture;
    }

    function clearProjectTextureCache() {
        clearCloudOccupancyCache();
        [skyMaterial, cloudMaterial].forEach(material => {
            Object.values(material?.uniforms || {}).forEach(uniform => {
                if (projectEnvironmentTextures.has(uniform?.value)) {
                    uniform.value = fallbackTexture || null;
                }
            });
        });
        projectEnvironmentTextures.forEach(texture => texture?.dispose?.());
        projectEnvironmentTextures.clear();
        externalEnvironmentTextures.forEach(entry=>{entry.image.onload=null;entry.image.onerror=null;});
        externalEnvironmentTextures.clear();
        projectTextureCache = new WeakMap();
    }

    function clearCloudOccupancyCache() {
        cloudDistanceWorker?.terminate();
        if (cloudDistanceWorkerUrl) URL.revokeObjectURL(cloudDistanceWorkerUrl);
        cloudDistanceWorker = cloudDistanceWorkerUrl = cloudDistancePending = cloudDistanceJob = null;
        cloudDistanceTextures.forEach(texture => texture?.dispose?.());
        cloudDistanceTextures.clear();
        cloudDistanceCache = new WeakMap();
        cloudOccupancyTextures.forEach(texture => texture?.dispose?.());
        cloudOccupancyTextures.clear();
        cloudOccupancyCache = new WeakMap();
    }

    function createCanvasTexture(canvas, name, options = {}) {
        const texture = THREE.CanvasTexture ? new THREE.CanvasTexture(canvas) : new THREE.Texture(canvas);
        return configureEnvironmentTexture(texture, {
            name,
            repeat: options.repeat === true
        });
    }

    function createProceduralCloudTexture(size = 256) {
        if (!window.THREE?.DataTexture) return null;
        const dimension = Math.max(64, Math.round(size || 256));
        const data = new Uint8Array(dimension * dimension * 4);
        const fract = value => value - Math.floor(value);
        const hash21 = (x, y) => {
            let px = fract(x * 123.34);
            let py = fract(y * 456.21);
            const dotValue = px * (px + 45.32) + py * (py + 45.32);
            px += dotValue;
            py += dotValue;
            return fract(px * py);
        };
        const valueNoise = (x, y) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            let fx = fract(x);
            let fy = fract(y);
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            const bottom = hash21(ix, iy) * (1 - fx) + hash21(ix + 1, iy) * fx;
            const top = hash21(ix, iy + 1) * (1 - fx) + hash21(ix + 1, iy + 1) * fx;
            return bottom * (1 - fy) + top * fy;
        };
        const blockClouds = (x, y) => {
            const px = Math.floor(x * 0.5) * 0.5;
            const py = Math.floor(y * 0.5) * 0.5;
            return valueNoise(px * 0.18, py * 0.18) * 0.58 +
                valueNoise(px * 0.43 + 17, py * 0.43 + 17) * 0.28 +
                valueNoise(px * 0.91 + 31, py * 0.91 + 31) * 0.14;
        };
        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                const value = Math.round(clamp(blockClouds(x, y), 0, 1) * 255);
                const offset = (y * dimension + x) * 4;
                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
                data[offset + 3] = 255;
            }
        }
        cloudRuntimeStats.sourceCacheBuilds++;
        return configureEnvironmentTexture(
            new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat),
            { name: 'Lightflow_Procedural_Cloud_Cache', repeat: true }
        );
    }

    function readCloudTexturePixels(texture) {
        const image = texture?.image || texture?.source?.data || null;
        const width = Math.max(0, Math.round(image?.width || image?.naturalWidth || 0));
        const height = Math.max(0, Math.round(image?.height || image?.naturalHeight || 0));
        if (!image || !width || !height) return null;
        if (image.data && image.data.length >= width * height * 4) {
            return { width, height, data: image.data, stamp: image.data };
        }
        if (typeof document === 'undefined') return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, width, height);
            return {
                width,
                height,
                data: context.getImageData(0, 0, width, height).data,
                stamp: image
            };
        } catch (error) {
            return null;
        }
    }

    function getCloudOccupancyTexture(sourceTexture) {
        if (!sourceTexture || !window.THREE?.DataTexture) return null;
        const cached = cloudOccupancyCache.get(sourceTexture);
        const image = sourceTexture.image || sourceTexture.source?.data;
        const sourceWidth = Math.max(0, Math.round(image?.width || image?.naturalWidth || 0));
        const sourceHeight = Math.max(0, Math.round(image?.height || image?.naturalHeight || 0));
        if (
            cached && cached.stamp === (image?.data || image) &&
            cached.sourceWidth === sourceWidth && cached.sourceHeight === sourceHeight &&
            cached.sourceVersion === sourceTexture.version
        ) return cached;
        const source = readCloudTexturePixels(sourceTexture);
        if (!source) return null;

        if (cached?.texture) {
            cached.texture.dispose?.();
            cloudOccupancyTextures.delete(cached.texture);
        }
        const blockSize = 4;
        const width = Math.max(1, Math.ceil(source.width / blockSize));
        const height = Math.max(1, Math.ceil(source.height / blockSize));
        const data = new Uint8Array(width * height * 4);
        const sourceValue = (x, y) => {
            const wrappedX = ((x % source.width) + source.width) % source.width;
            const wrappedY = ((y % source.height) + source.height) % source.height;
            const offset = (wrappedY * source.width + wrappedX) * 4;
            const alpha = source.data[offset + 3] / 255;
            if (alpha < 0.999) return alpha;
            return (
                source.data[offset] * 0.299 +
                source.data[offset + 1] * 0.587 +
                source.data[offset + 2] * 0.114
            ) / 255;
        };
        for (let blockY = 0; blockY < height; blockY++) {
            for (let blockX = 0; blockX < width; blockX++) {
                let maximum = 0;
                for (let offsetY = 0; offsetY < blockSize; offsetY++) {
                    for (let offsetX = 0; offsetX < blockSize; offsetX++) {
                        maximum = Math.max(
                            maximum,
                            sourceValue(blockX * blockSize + offsetX, blockY * blockSize + offsetY)
                        );
                    }
                }
                const value = Math.round(clamp(maximum, 0, 1) * 255);
                const offset = (blockY * width + blockX) * 4;
                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
                data[offset + 3] = 255;
            }
        }
        const texture = configureEnvironmentTexture(
            new THREE.DataTexture(data, width, height, THREE.RGBAFormat),
            { name: 'Lightflow_Cloud_Occupancy4x4', repeat: true }
        );
        const record = {
            texture,
            width,
            height,
            stamp: source.stamp,
            sourceWidth: source.width,
            sourceHeight: source.height,
            sourceVersion: sourceTexture.version,
            conservative: source.width % blockSize === 0 && source.height % blockSize === 0
        };
        cloudOccupancyCache.set(sourceTexture, record);
        cloudOccupancyTextures.add(texture);
        cloudRuntimeStats.occupancyBuilds++;
        return record;
    }

    // Periodic rectangular (L-infinity) distance to the union of occupied cells.
    // RG stores signed center distance; B stores nearest-ring side/corner flags.
    // The shader reconstructs the exact subcell distance instead of bilinearly
    // rounding or chamfering a rectangular contour at convex/concave corners.
    function buildCloudDistanceField(source, threshold) {
        const width = source.width, height = source.height;
        if (width > 512 || height > 512) return null;
        const count = width * height, cap = 8;
        const mask = new Uint8Array(count), distance = new Float32Array(count);
        const queue = new Int32Array(count);
        const index = (x,y) => ((y%height+height)%height)*width+(x%width+width)%width;
        for (let i = 0; i < count; i++) {
            const offset = i*4, alpha = source.data[offset+3]/255;
            const value = alpha < .999 ? alpha : (source.data[offset]*.299+source.data[offset+1]*.587+source.data[offset+2]*.114)/255;
            mask[i] = value >= threshold ? 1 : 0;
            distance[i] = cap;
        }
        let head = 0, tail = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = y*width+x;
            let boundary = false;
            for (let dy = -1; dy <= 1 && !boundary; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (mask[index(x+dx,y+dy)] !== mask[i]) { boundary = true; break; }
            }
            if (boundary) { distance[i] = .5; queue[tail++] = i; }
        }
        // Multi-source eight-neighbor transform, bounded to eight cells. This
        // runs only when topology changes, using the existing background worker.
        while (head < tail) {
            const i = queue[head++], x = i%width, y = Math.floor(i/width);
            const next = distance[i]+1;
            if (next >= cap) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const j = index(x+dx,y+dy);
                if (mask[j] === mask[i] && distance[j] > next) {
                    distance[j] = next; queue[tail++] = j;
                }
            }
        }
        const data = new Uint8Array(count*4);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = y*width+x, value = mask[i];
            let flags = 0;
            if (distance[i] < cap) {
                const r = Math.round(distance[i]+.5);
                // Ring side interiors have a single dominant axis. Corners
                // need max(dx,dy); keeping them distinct preserves square insets.
                for (let k = -r+1; k < r; k++) {
                    if (mask[index(x+r,y+k)] !== value) flags |= 1;
                    if (mask[index(x-r,y+k)] !== value) flags |= 2;
                    if (mask[index(x+k,y+r)] !== value) flags |= 4;
                    if (mask[index(x+k,y-r)] !== value) flags |= 8;
                }
                if (mask[index(x+r,y+r)] !== value) flags |= 16;
                if (mask[index(x-r,y+r)] !== value) flags |= 32;
                if (mask[index(x+r,y-r)] !== value) flags |= 64;
                if (mask[index(x-r,y-r)] !== value) flags |= 128;
            }
            const signed = distance[i]*(value ? 1 : -1);
            const encoded = Math.round(clamp(signed/16+.5,0,1)*65535);
            data[i*4] = encoded >> 8; data[i*4+1] = encoded & 255;
            data[i*4+2] = flags; data[i*4+3] = 255;
        }
        return {data, width, height};
    }

    function installCloudDistanceField(cached, field, bucket) {
        if (!field) return;
        if (cached.texture) { cached.texture.dispose(); cloudDistanceTextures.delete(cached.texture); }
        const texture = configureEnvironmentTexture(new THREE.DataTexture(field.data, field.width, field.height, THREE.RGBAFormat),
            {name: 'Lightflow_Vibrant_Cloud_Distance', repeat: true});
        texture.minFilter = texture.magFilter = THREE.NearestFilter;
        cached.texture = texture;
        cached.bucket = bucket;
        cloudDistanceTextures.add(texture);
    }

    function dispatchCloudDistanceJob() {
        if (cloudDistanceJob || !cloudDistancePending) return;
        cloudDistanceJob = cloudDistancePending;
        cloudDistancePending = null;
        const {cached, threshold} = cloudDistanceJob;
        const data = new Uint8Array(cached.source.data);
        cloudDistanceWorker.postMessage({source: {width: cached.source.width, height: cached.source.height, data},threshold}, [data.buffer]);
    }

    function getCloudDistanceTexture(sourceTexture, coverage, contrast) {
        if (!sourceTexture || !window.THREE?.DataTexture) return null;
        const image = sourceTexture.image || sourceTexture.source?.data;
        let cached = cloudDistanceCache.get(sourceTexture);
        if (Math.max(image?.width || image?.naturalWidth || 0, image?.height || image?.naturalHeight || 0) > 512) {
            if (cached) {
                cached.disposed = true;
                cached.texture?.dispose(); cloudDistanceTextures.delete(cached.texture);
                cloudDistanceCache.delete(sourceTexture);
            }
            return null;
        }
        if (!cached || cached.stamp !== (image?.data || image) || cached.version !== sourceTexture.version) {
            if (cached) cached.disposed = true;
            if (cached?.texture) { cached.texture.dispose(); cloudDistanceTextures.delete(cached.texture); }
            const source = readCloudTexturePixels(sourceTexture);
            if (!source) return null;
            const levels = new Set();
            for (let i = 0; i < source.data.length; i += 4) levels.add(source.data[i + 3] < 255
                ? source.data[i + 3] / 255 : (source.data[i] * .299 + source.data[i + 1] * .587 + source.data[i + 2] * .114) / 255);
            cached = {source, levels: Array.from(levels).sort((a,b) => a-b), stamp: source.stamp, version: sourceTexture.version, bucket: -1};
            cloudDistanceCache.set(sourceTexture, cached);
        }
        const threshold = .5 + (.5 - coverage) / Math.max(contrast, .1);
        const bucket = cached.levels.filter(value => value < threshold).length;
        cached.requestedBucket = bucket;
        if (cached.bucket === bucket) {
            if (cloudDistancePending?.cached === cached) cloudDistancePending = null;
            return cached.texture ? cached : null;
        }
        // Keep only the newest requested topology while a worker is busy.
        // Until that exact mask is ready the shader uses its occupancy fallback,
        // never a stale field from a different layout or an unbounded job queue.
        if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
            if (!cloudDistanceWorker) {
                cloudDistanceWorkerUrl = URL.createObjectURL(new Blob([
                    'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));', buildCloudDistanceField.toString(),
                    'onmessage=e=>{const start=performance.now();const field=buildCloudDistanceField(e.data.source,e.data.threshold);postMessage({field,ms:performance.now()-start},field?[field.data.buffer]:[])};'
                ], {type: 'text/javascript'}));
                cloudDistanceWorker = new Worker(cloudDistanceWorkerUrl);
                cloudDistanceWorker.onmessage = event => {
                    const job = cloudDistanceJob;
                    cloudDistanceJob = null;
                    if (job && !job.cached.disposed && job.cached.requestedBucket === job.bucket) {
                        installCloudDistanceField(job.cached,event.data.field,job.bucket);
                        job.cached.bucket = job.bucket;
                    }
                    cloudRuntimeStats.distanceBuilds++;
                    cloudRuntimeStats.distanceBuildMs = event.data.ms;
                    dispatchCloudDistanceJob();
                    if (environmentRuntimeLoaded) { updateScene({forceShadow:false}); requestPreviewRender(); }
                };
                cloudDistanceWorker.onerror = () => {
                    cloudDistanceWorker?.terminate();
                    cloudDistanceWorker = null;
                    if (cloudDistanceWorkerUrl) URL.revokeObjectURL(cloudDistanceWorkerUrl);
                    cloudDistanceWorkerUrl = null;
                    cloudDistanceJob = cloudDistancePending = null;
                };
            }
            cached.requestedBucket = bucket;
            if (cloudDistanceJob?.cached !== cached || cloudDistanceJob.bucket !== bucket)
                cloudDistancePending = {cached,threshold,bucket};
            dispatchCloudDistanceJob();
            return null;
        }
        const start = performance.now();
        const field = buildCloudDistanceField(cached.source, threshold);
        cached.bucket = bucket;
        if (!field) return null;
        installCloudDistanceField(cached,field,bucket);
        cloudRuntimeStats.distanceBuilds++;
        cloudRuntimeStats.distanceBuildMs = performance.now() - start;
        return cached;
    }

    const VANILLA_RESOURCE_STORAGE_KEY = 'lightflow_environment.local_vanilla.v1';
    const VANILLA_RESOURCE_NAMES = ['sun', 'moon_phases', 'clouds', 'end_sky'];
    const VANILLA_RESOURCE_MAX_BYTES = 1024 * 1024;
    const vanillaResourceDecoders = new Set();
    let vanillaResourceGeneration = 0;
    let vanillaResourceStatus = {state: 'missing', source: '', persisted: false, files: []};
    let vanillaResourceRestorePending = true;
    let automaticVanillaAttempted = false;
    let automaticVanillaTransfer = null;
    let managedVanillaRoot = '';
    let managedVanillaRequestRoot = '';
    const VANILLA_RESOURCE_REVISION = '46ba6ea985fb5a92d79a9419198f10dda14c199d';
    const VANILLA_RESOURCE_HASHES = {
        sun: 'f7273544b691f08aaef76373d526e00793cf1e1aa0e1df8518f738d44a8e526b',
        moon_phases: '01c566d48e0cc8618cf6fdce811b61175fc246f12f2e8f2c567d6acd3a2b35d8',
        clouds: '4f57cfe866779ef82be0058e244a77b0a279ee75e9eb40ac9ce6eb372445adc8',
        end_sky: '3749aedacd0a9fbf4a9bce802fc2da247c3b2fb52b941d954dc467daf734efb8'
    };

    function readConfiguredTerrainSkyResources() {
        try {
            const terrain = window.LightflowTerrainRender || window.BedrockStructureStudio;
            const managed = terrain?.packs?.environmentResources?.(window.Project);
            if (managed) {
                const images = {};
                for (const kind of VANILLA_RESOURCE_NAMES) {
                    validateVanillaPng(managed.images[kind], kind);
                    images[kind] = encodeVanillaPng(managed.images[kind]);
                }
                return {version: 1, source: 'Lightflow resource packs · ' + managed.root, root: managed.root, images};
            }
            if (typeof require !== 'function') return null;
            const root = terrain?.packs?.resourcePath ? terrain.packs.resourcePath(window.Project) : terrain?.getRememberedResourcePackPath?.();
            if (!root) return null;
            const fs = require('node:fs', {scope: root, optional: true, show_permission_dialog: false});
            if (!fs) return null;
            const path = require('node:path'), images = {};
            for (const kind of VANILLA_RESOURCE_NAMES) {
                const file = path.join(root, 'textures', 'environment', kind + '.png');
                if (fs.statSync(file).size > VANILLA_RESOURCE_MAX_BYTES) return null;
                const bytes = new Uint8Array(fs.readFileSync(file));
                validateVanillaPng(bytes, kind);
                images[kind] = encodeVanillaPng(bytes);
            }
            return {version: 1, source: 'Lightflow resource packs · ' + root, root, images};
        } catch (_) { return null; }
    }

    async function syncManagedVanillaResources() {
        if (!environmentRuntimeLoaded || vanillaResourceRestorePending) return false;
        const local = readConfiguredTerrainSkyResources();
        const requestedRoot = local?.root || '';
        if (requestedRoot !== managedVanillaRequestRoot) {
            managedVanillaRequestRoot = requestedRoot;
            vanillaResourceGeneration++;
            automaticVanillaTransfer?.abort();
        }
        if (local) {
            if (managedVanillaRoot === local.root && vanillaResourceStatus.state === 'ready') return true;
            automaticVanillaTransfer?.abort();
            automaticVanillaAttempted = true;
            const generation = ++vanillaResourceGeneration;
            try {
                const applied = await applyLocalVanillaResources(local, false, generation);
                if (applied) managedVanillaRoot = local.root;
                return applied;
            } catch (error) {
                if (generation === vanillaResourceGeneration && environmentRuntimeLoaded) console.warn('[Lightflow] Pack sky resources:', error.message);
                return false;
            }
        }
        if (managedVanillaRoot) {
            managedVanillaRoot = '';
            clearLocalVanillaResources(false);
            if (await restoreLocalVanillaResources()) return true;
            automaticVanillaAttempted = false;
        }
        if (settings.enabled) return prepareAutomaticVanillaResources();
        return false;
    }

    async function prepareAutomaticVanillaResources() {
        if (!environmentRuntimeLoaded || vanillaResourceRestorePending || automaticVanillaAttempted || vanillaResourceStatus.state === 'ready') return false;
        automaticVanillaAttempted = true;
        const generation = ++vanillaResourceGeneration;
        const controller = new AbortController();
        automaticVanillaTransfer = controller;
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const local = readConfiguredTerrainSkyResources();
            if (local) {
                const applied = await applyLocalVanillaResources(local, false, generation);
                if (applied) managedVanillaRoot = local.root;
                return applied;
            }
            const images = {};
            for (const kind of VANILLA_RESOURCE_NAMES) {
                const url = `https://raw.githubusercontent.com/Mojang/bedrock-samples/${VANILLA_RESOURCE_REVISION}/resource_pack/textures/environment/${kind}.png`;
                const response = await fetch(url, {signal: controller.signal, credentials: 'omit', redirect: 'error'});
                if (!response.ok || Number(response.headers.get('content-length')) > VANILLA_RESOURCE_MAX_BYTES) throw new Error('Official resource request failed.');
                const bytes = new Uint8Array(await response.arrayBuffer());
                validateVanillaPng(bytes, kind);
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
                const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
                if (hash !== VANILLA_RESOURCE_HASHES[kind]) throw new Error('Official resource fingerprint mismatch.');
                images[kind] = encodeVanillaPng(bytes);
            }
            return await applyLocalVanillaResources({version: 1, source: 'Mojang bedrock-samples · ' + VANILLA_RESOURCE_REVISION.slice(0, 12), images}, true, generation);
        } catch (error) {
            if (generation === vanillaResourceGeneration && environmentRuntimeLoaded) {
                vanillaResourceStatus = {state: 'unavailable', source: '', persisted: false, files: []};
                console.warn('[Lightflow] Vanilla resource preparation:', error.message);
                syncEnvironmentPanel();
            }
            return false;
        } finally {
            clearTimeout(timeout);
            if (automaticVanillaTransfer === controller) automaticVanillaTransfer = null;
        }
    }

    function validateVanillaPng(bytes, kind) {
        if (!(bytes instanceof Uint8Array) || bytes.length < 33 || bytes.length > VANILLA_RESOURCE_MAX_BYTES) {
            throw new Error(`${kind}: PNG must be smaller than 1 MiB.`);
        }
        const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
        if (!signature.every((value, index) => bytes[index] === value)) throw new Error(`${kind}: invalid PNG header.`);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const width = view.getUint32(16), height = view.getUint32(20);
        if (!width || !height || width > 2048 || height > 2048 || width * height > 2097152) {
            throw new Error(`${kind}: unsupported image dimensions.`);
        }
        if (kind === 'moon_phases' && (width % 4 || height % 2 || width / 4 !== height / 2)) {
            throw new Error('moon_phases: expected a 4 x 2 atlas with square frames.');
        }
        return {width, height};
    }

    function selectVanillaArchiveEntries(archive) {
        const groups = new Map();
        for (const [path, entry] of Object.entries(archive.files || {})) {
            if (entry.dir || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) continue;
            const match = path.match(/^(.*?(?:assets\/minecraft\/textures\/environment\/|textures\/environment\/))(sun|moon_phases|clouds|end_sky)\.png$/);
            if (!match) continue;
            const group = groups.get(match[1]) || {};
            group[match[2]] = entry;
            groups.set(match[1], group);
        }
        const complete = [...groups.values()].filter(group => VANILLA_RESOURCE_NAMES.every(kind => group[kind]));
        if (complete.length !== 1) throw new Error(complete.length
            ? 'Several complete resource sets found. Select a ZIP containing one version.'
            : 'Expected sun.png, moon_phases.png, clouds.png and end_sky.png in one textures/environment directory.');
        return complete[0];
    }

    function encodeVanillaPng(bytes) {
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        }
        return 'data:image/png;base64,' + btoa(binary);
    }

    function decodeVanillaPng(value, kind) {
        if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > 1400000) {
            throw new Error(`${kind}: invalid local resource cache.`);
        }
        const bytes = Uint8Array.from(atob(value.slice(22)), character => character.charCodeAt(0));
        validateVanillaPng(bytes, kind);
        return bytes;
    }

    function getVanillaResourceStatus() {
        return JSON.parse(JSON.stringify(vanillaResourceStatus));
    }

    function decodeVanillaTexture(bytes, kind) {
        const dimensions = validateVanillaPng(bytes, kind);
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(new Blob([bytes], {type: 'image/png'}));
            const image = new Image();
            const finish = (error) => {
                image.onload = image.onerror = null;
                URL.revokeObjectURL(url);
                vanillaResourceDecoders.delete(cancel);
                if (error) { reject(error); return; }
                if (image.naturalWidth !== dimensions.width || image.naturalHeight !== dimensions.height) {
                    reject(new Error(`${kind}: decoded dimensions differ from the PNG header.`)); return;
                }
                resolve(configureEnvironmentTexture(new THREE.Texture(image), {
                    name: `Lightflow_Local_Vanilla_${kind}`, repeat: kind === 'clouds' || kind === 'end_sky'
                }));
            };
            const cancel = () => finish(new Error('Local resource load cancelled.'));
            vanillaResourceDecoders.add(cancel);
            image.onload = () => finish();
            image.onerror = () => finish(new Error(`${kind}: PNG could not be decoded.`));
            image.src = url;
        });
    }

    async function applyLocalVanillaResources(record, persist = false, generation = ++vanillaResourceGeneration) {
        if (!record || record.version !== 1 || typeof record.source !== 'string') throw new Error('Invalid resource record.');
        const tasks = VANILLA_RESOURCE_NAMES.map(async kind => {
            const bytes = decodeVanillaPng(record.images?.[kind], kind);
            const texture = await decodeVanillaTexture(bytes, kind);
            return {kind, texture, bytes: bytes.length, ...validateVanillaPng(bytes, kind)};
        });
        const results = await Promise.allSettled(tasks);
        const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        const failed = results.find(result => result.status === 'rejected');
        if (failed || generation !== vanillaResourceGeneration || !environmentRuntimeLoaded) {
            loaded.forEach(resource => resource.texture.dispose());
            if (failed) throw failed.reason;
            return false;
        }
        const old = [vanillaSunTexture, vanillaMoonPhasesTexture, vanillaCloudTexture, endSkyTexture];
        const textures = Object.fromEntries(loaded.map(resource => [resource.kind, resource.texture]));
        vanillaSunTexture = textures.sun;
        vanillaMoonPhasesTexture = textures.moon_phases;
        vanillaCloudTexture = textures.clouds;
        endSkyTexture = textures.end_sky;
        // A separate Vibrant Visuals asset has no established provenance. Do not
        // substitute a fabricated sun or advertise this as Vibrant render parity.
        vibrantVisualsSunTexture = null;
        let persisted = !persist;
        if (persist) {
            try { localStorage.setItem(VANILLA_RESOURCE_STORAGE_KEY, JSON.stringify(record)); persisted = true; }
            catch (_) {
                persisted = false;
                // Never leave an older pack selected on the next launch.
                try { localStorage.removeItem(VANILLA_RESOURCE_STORAGE_KEY); } catch (_) {}
            }
        }
        vanillaResourceStatus = {state: 'ready', source: record.source.slice(0, 180), persisted,
            files: loaded.map(({kind, bytes, width, height}) => ({kind, bytes, width, height}))};
        clearCloudOccupancyCache();
        updateScene({forceShadow: false});
        old.forEach(texture => texture?.dispose?.());
        syncEnvironmentPanel();
        return true;
    }

    async function importVanillaArchive(content, source = 'Local pack') {
        automaticVanillaTransfer?.abort();
        const generation = ++vanillaResourceGeneration;
        if (!environmentRuntimeLoaded) throw new Error('Environment is not loaded.');
        if (!content || !Number.isFinite(content.byteLength ?? content.size ?? content.length) ||
            (content.byteLength ?? content.size ?? content.length) > 512 * 1024 * 1024) {
            throw new Error('Select a local pack or JAR smaller than 512 MiB.');
        }
        if (typeof JSZip === 'undefined') throw new Error('This Blockbench session does not provide JSZip.');
        const archive = await new JSZip().loadAsync(content);
        const entries = selectVanillaArchiveEntries(archive);
        const images = {};
        for (const kind of VANILLA_RESOURCE_NAMES) {
            const entry = entries[kind];
            if (entry._data?.uncompressedSize > VANILLA_RESOURCE_MAX_BYTES) throw new Error(`${kind}: PNG exceeds 1 MiB.`);
            const bytes = await entry.async('uint8array');
            validateVanillaPng(bytes, kind);
            images[kind] = encodeVanillaPng(bytes);
        }
        return applyLocalVanillaResources({version: 1, source: String(source).split(/[\\/]/).pop().slice(0, 180), images}, true, generation);
    }

    function restoreLocalVanillaResources() {
        try {
            const stored = localStorage.getItem(VANILLA_RESOURCE_STORAGE_KEY);
            if (!stored) return Promise.resolve(false);
            if (stored.length > 5601000) throw new Error('Local resource cache exceeds its size limit.');
            const generation = ++vanillaResourceGeneration;
            return applyLocalVanillaResources(JSON.parse(stored), false, generation).catch(error => {
                if (!environmentRuntimeLoaded || generation !== vanillaResourceGeneration) return;
                vanillaResourceStatus = {state: 'error', source: '', persisted: false, files: []};
                console.warn('[Lightflow] Local Vanilla resources:', error.message);
                syncEnvironmentPanel();
            });
        } catch (_) { vanillaResourceStatus = {state: 'error', source: '', persisted: false, files: []}; return Promise.resolve(false); }
    }

    function clearLocalVanillaResources(forget = true) {
        automaticVanillaAttempted = true;
        automaticVanillaTransfer?.abort();
        vanillaResourceGeneration++;
        [...vanillaResourceDecoders].forEach(cancel => cancel());
        if (forget) { try { localStorage.removeItem(VANILLA_RESOURCE_STORAGE_KEY); } catch (_) {} }
        const old = [vanillaSunTexture, vanillaMoonPhasesTexture, vanillaCloudTexture, endSkyTexture];
        vanillaSunTexture = vanillaMoonPhasesTexture = vanillaCloudTexture = endSkyTexture = null;
        vanillaResourceStatus = {state: 'missing', source: '', persisted: false, files: []};
        clearCloudOccupancyCache();
        updateScene({forceShadow: false});
        old.forEach(texture => texture?.dispose?.());
        syncEnvironmentPanel();
    }

    function openVanillaResourceDialog() {
        const packs = (window.LightflowTerrainRender || window.BedrockStructureStudio)?.packs;
        if (packs?.open) return packs.open({section: 'vanilla'});
        const status = getVanillaResourceStatus();
        const ready = status.state === 'ready';
        vanillaResourceDialog?.hide?.();
        const dialog = vanillaResourceDialog = new Dialog('lightflow_environment_local_resources', {
            title: 'lightflow_environment.resources.title',
            width: 560,
            form: (window.LightManagerUI?.prepareForm || (form => form))({
                help: {type: 'info', text: tr('lightflow_environment.resources.help')},
                retry: {type: 'buttons', condition: !ready, buttons: [tr('lightflow_environment.resources.retry')], click() {
                    automaticVanillaAttempted = false;
                    prepareAutomaticVanillaResources().then(applied => {if (applied && environmentRuntimeLoaded) {dialog.hide(); openVanillaResourceDialog();}});
                }},
                status: {type: 'info', text: ready
                    ? `${tr('lightflow_environment.resources.loaded')}: ${status.source.replace(/[<>&]/g, '')}${status.persisted ? '' : ' (' + tr('lightflow_environment.resources.session') + ')'}`
                    : tr('lightflow_environment.resources.missing')},
                import: {type: 'buttons', buttons: [tr('lightflow_environment.resources.import')], click() {
                    Blockbench.import({extensions: ['zip', 'mcpack', 'jar'], type: 'Minecraft resource pack', readtype: 'binary'}, files => {
                        if (!files?.[0]) return;
                        importVanillaArchive(files[0].content, files[0].name || files[0].path).then(applied => {
                            if (applied) { dialog.hide(); openVanillaResourceDialog(); }
                        }).catch(error => {
                            if (environmentRuntimeLoaded) Blockbench.showMessageBox({title: 'Lightflow', message: error.message, icon: 'error'});
                        });
                    });
                }},
                remove: {type: 'buttons', condition: ready, buttons: [tr('lightflow_environment.resources.remove')], click() {
                    clearLocalVanillaResources(); dialog.hide(); openVanillaResourceDialog();
                }}
            }),
            buttons: ['dialog.close']
        });
        dialog.show();
    }

    function ensureSkyTextures() {
        if (!window.THREE?.DataTexture || typeof document === 'undefined') return;
        if (!fallbackTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, 1, 1);
            fallbackTexture = createCanvasTexture(canvas, 'Lightflow_Environment_Fallback');
        }
        if (!proceduralCloudTexture) proceduralCloudTexture = createProceduralCloudTexture(256);
        if (builtInSkyTexturesReady) {
            if (settings.enabled && !automaticVanillaAttempted && !vanillaResourceRestorePending && vanillaResourceStatus.state !== 'ready') {
                void prepareAutomaticVanillaResources();
            }
            return;
        }
        missingSkyTexture = configureEnvironmentTexture(new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat),
            {name: 'Lightflow_Missing_Local_Resource'});
        builtInSkyTexturesReady = true;
        vanillaResourceRestorePending = true;
        restoreLocalVanillaResources().finally(() => {
            vanillaResourceRestorePending = false;
            void syncManagedVanillaResources();
        });
    }

    function getSunDirection(timeValue = settings.time) {
        let angle = mod(timeValue, 24000) / 24000 * TWO_PI;
        if (settings.sky_cycle_mode === 'reference') {
            // Minecraft's eased celestial clock keeps the sun above the
            // horizon through late sunset. A uniform orbit was hiding it
            // before the measured Bedrock 12500-tick sunset had finished.
            const phase = mod(timeValue / 24000 - .25, 1);
            const eased = phase + ( .5 - Math.cos(phase * Math.PI) * .5 - phase) / 3;
            angle = eased * TWO_PI + Math.PI * .5;
        }
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const horizontal = Math.cos(angle);
        return [
            horizontal * Math.cos(azimuth),
            Math.sin(angle),
            horizontal * Math.sin(azimuth)
        ];
    }

    function getCloudMotionTime() {
        const phase = Number(settings.cloud_motion_phase) || 0;
        if (settings.cloud_paused) return phase;
        const frame = window.LightflowCinematicFrameContext;
        if (frame?.deterministic && Number.isFinite(frame.timeSeconds)) {
            return phase + frame.timeSeconds * settings.cloud_speed;
        }
        const seconds = performance.now() * 0.001;
        if (window.LightManagerStudioRenderSession) {
            // A Studio frame can span several tiles and AA samples. Keep the
            // cloud field on one instant so adjacent tiles cannot capture
            // different positions while the export is being assembled.
            if (!Number.isFinite(studioCloudMotionSeconds)) studioCloudMotionSeconds = seconds;
            return phase + studioCloudMotionSeconds * settings.cloud_speed;
        }
        studioCloudMotionSeconds = null;
        return phase + seconds * settings.cloud_speed;
    }

    function updateCloudDerivedUniforms(time = getCloudMotionTime()) {
        if (!cloudMaterial?.uniforms?.uCloudDerived) return time;
        const scale = Math.max(finite(settings.cloud_scale, 1), 0.01);
        const angle = finite(settings.cloud_direction, 0) / 180 * Math.PI;
        const motionDistance = time * 24;
        cloudMaterial.uniforms.uCloudDerived.value.set(
            Math.cos(angle) * motionDistance - finite(settings.cloud_offset_x, 0),
            Math.sin(angle) * motionDistance - finite(settings.cloud_offset_y, 0),
            12 / scale,
            1536 / Math.max(0.35, Math.sqrt(scale))
        );
        return time;
    }

    /*
     * Studio Render may pass a boolean or { studioBloomEnabled }. An explicitly
     * disabled Studio Bloom keeps profile metadata readable but marks it inactive.
     * Component contributions never force Bloom on by themselves.
     */
    function getBloomSettings(context = null) {
        const studioBloomEnabled = typeof context === 'boolean'
            ? context
            : context && typeof context === 'object' && Object.prototype.hasOwnProperty.call(context, 'studioBloomEnabled')
                ? !!context.studioBloomEnabled
                : true;
        const profileEnabled = !!(settings.enabled && settings.environment_bloom_enabled && !getDimensionAtmosphere());
        const active = profileEnabled && studioBloomEnabled;
        const sunHeight = getSunDirection()[1];
        const sunVisible = settings.sun_mode !== 'hidden' && settings.sun_opacity > 0 && sunHeight >= -0.055;
        const moonVisible = settings.moon_mode !== 'hidden' && settings.moon_opacity > 0 && -sunHeight >= -0.055;
        return {
            enabled: active,
            active,
            profile_enabled: profileEnabled,
            studio_bloom_enabled: studioBloomEnabled,
            threshold: settings.bloom_threshold,
            soft_knee: settings.bloom_soft_knee,
            strength: settings.bloom_strength,
            core_strength: settings.bloom_core_strength,
            core_radius: settings.bloom_core_radius,
            halo_strength: settings.bloom_halo_strength,
            halo_radius: settings.bloom_halo_radius,
            hdr_strength: settings.bloom_hdr_strength,
            emissive_strength: settings.bloom_emissive_strength,
            occlusion: settings.bloom_occlusion,
            components: {
                sun: { enabled: sunVisible, contribution: settings.sun_bloom_contribution },
                moon: { enabled: moonVisible, contribution: settings.moon_bloom_contribution },
                stars: { enabled: settings.stars_enabled, contribution: settings.star_bloom_contribution },
                clouds: { enabled: settings.clouds_enabled,
                    contribution: getEffectiveCloudAppearance()?.cloud_bloom_contribution ?? settings.cloud_bloom_contribution }
            }
        };
    }

    function getBloomContribution(component, context = null) {
        const bloom = getBloomSettings(context);
        const entry = bloom.components[String(component || '').toLowerCase()];
        return bloom.active && entry?.enabled ? entry.contribution : 0;
    }

    function configureBloomDepthMaterial(material) {
        material.uniforms.uEnvironmentVisibilityPass = { value: false };
        material.uniforms.uEnvironmentSceneDepth = { value: fallbackTexture };
        material.uniforms.uEnvironmentDepthSize = { value: new THREE.Vector2(1, 1) };
        material.uniforms.uEnvironmentHasDepth = { value: false };
        material.fragmentShader = `
uniform sampler2D uEnvironmentSceneDepth;
uniform vec2 uEnvironmentDepthSize;
uniform bool uEnvironmentHasDepth;
uniform bool uEnvironmentVisibilityPass;
` + material.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, match => `${match}
    if (uEnvironmentBloomPass && uEnvironmentHasDepth) {
        float sceneDepth = texture2D(uEnvironmentSceneDepth, gl_FragCoord.xy / uEnvironmentDepthSize).x;
        if (sceneDepth < 0.99999) discard;
    }
`);
    }

    function renderBloomContribution(preview, options = {}) {
        const renderer = preview?.renderer;
        const target = options.target || null;
        const scene = window.Canvas?.scene;
        const bloom = getBloomSettings({ studioBloomEnabled: true });
        if (!renderer || !target || !scene || !bloom.active) return false;
        const environmentObjects = [skyMesh, starMesh, cloudMesh].filter(object => object?.visible);
        if (!environmentObjects.length) return false;
        const environmentSet = new Set(environmentObjects);
        const visibility = [];
        scene.traverse(object => {
            if (!object?.visible || environmentSet.has(object)) return;
            if (!(object.isMesh || object.isSprite || object.isLine || object.isLineSegments || object.isPoints)) return;
            visibility.push({ object, visible: object.visible });
            object.visible = false;
        });
        const materials = environmentObjects
            .map(object => object.material)
            .filter(Boolean)
            .map(material => ({
                material,
                transparent: material.transparent,
                blending: material.blending,
                depthWrite: material.depthWrite,
                blendEquation: material.blendEquation,
                blendSrc: material.blendSrc,
                blendDst: material.blendDst,
                blendEquationAlpha: material.blendEquationAlpha,
                blendSrcAlpha: material.blendSrcAlpha,
                blendDstAlpha: material.blendDstAlpha
            }));
        const previousTarget = renderer.getRenderTarget?.() || null;
        const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
        const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
        const previousScissorTest = renderer.getScissorTest?.() ?? false;
        const previousAutoClear = renderer.autoClear;
        const previousClearColor = renderer.getClearColor?.(new THREE.Color()) || new THREE.Color();
        const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
        const previousBackground = scene.background;
        try {
            scene.background = null;
            const sceneDepth = options.depthTexture ||
                window.LightflowFramePipeline?.getFrameResources?.(preview)?.depthTexture || null;
            materials.forEach(({ material }) => {
                material.uniforms.uEnvironmentHasDepth.value = !!sceneDepth;
                material.uniforms.uEnvironmentSceneDepth.value = sceneDepth || fallbackTexture;
                material.uniforms.uEnvironmentDepthSize.value.set(Math.max(1, target.width), Math.max(1, target.height));
            });
            if (skyMaterial) {
                skyMaterial.uniforms.uEnvironmentBloomPass.value = true;
                skyMaterial.uniforms.uSunBloomContribution.value = settings.sun_bloom_contribution;
                skyMaterial.uniforms.uMoonBloomContribution.value = settings.moon_bloom_contribution;
            }
            if (starMaterial) {
                starMaterial.uniforms.uEnvironmentBloomPass.value = true;
                starMaterial.uniforms.uStarBloomContribution.value = settings.star_bloom_contribution;
            }
            if (cloudMaterial) {
                cloudMaterial.uniforms.uEnvironmentBloomPass.value = true;
                cloudMaterial.uniforms.uCloudBloomContribution.value =
                    getEffectiveCloudAppearance()?.cloud_bloom_contribution ?? settings.cloud_bloom_contribution;
            }
            materials.forEach(({ material }) => {
                material.transparent = true;
                material.depthWrite = false;
                material.blending = THREE.CustomBlending;
                material.blendEquation = THREE.AddEquation;
                material.blendSrc = THREE.OneFactor;
                material.blendDst = THREE.OneFactor;
                material.blendEquationAlpha = THREE.AddEquation;
                material.blendSrcAlpha = THREE.OneFactor;
                material.blendDstAlpha = THREE.OneFactor;
            });
            // Clouds cover celestial emission even when they emit no bloom.
            // Their shader already returns premultiplied RGB plus coverage.
            if (cloudMaterial && environmentSet.has(cloudMesh)) {
                cloudMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
                cloudMaterial.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            }
            target.viewport?.set?.(0, 0, Math.max(1, target.width || 1), Math.max(1, target.height || 1));
            target.scissorTest = false;
            renderer.autoClear = false;
            renderer.setRenderTarget?.(target);
            renderer.setScissorTest?.(false);
            const beforeCalls = Number(renderer.info?.render?.calls) || 0;
            renderer.render(scene, preview.camera);
            return {
                submissions: 1,
                drawCalls: Math.max(0, (Number(renderer.info?.render?.calls) || 0) - beforeCalls),
                components: environmentObjects.length
            };
        } finally {
            scene.background = previousBackground;
            materials.forEach(({ material }) => {
                material.uniforms.uEnvironmentHasDepth.value = false;
                material.uniforms.uEnvironmentSceneDepth.value = fallbackTexture;
            });
            if (skyMaterial) skyMaterial.uniforms.uEnvironmentBloomPass.value = false;
            if (starMaterial) starMaterial.uniforms.uEnvironmentBloomPass.value = false;
            if (cloudMaterial) cloudMaterial.uniforms.uEnvironmentBloomPass.value = false;
            materials.forEach(entry => Object.assign(entry.material, {
                transparent: entry.transparent,
                blending: entry.blending,
                depthWrite: entry.depthWrite,
                blendEquation: entry.blendEquation,
                blendSrc: entry.blendSrc,
                blendDst: entry.blendDst,
                blendEquationAlpha: entry.blendEquationAlpha,
                blendSrcAlpha: entry.blendSrcAlpha,
                blendDstAlpha: entry.blendDstAlpha
            }));
            visibility.forEach(entry => { entry.object.visible = entry.visible; });
            renderer.setRenderTarget?.(previousTarget);
            if (!previousTarget) {
                if (previousViewport) renderer.setViewport?.(previousViewport);
                if (previousScissor) renderer.setScissor?.(previousScissor);
                renderer.setScissorTest?.(previousScissorTest);
            }
            renderer.autoClear = previousAutoClear;
            renderer.setClearColor?.(previousClearColor, previousClearAlpha);
        }
    }

    // Shadow/program-key queries need only the celestial light. Keep sky
    // gradients, cloud timelines, fog and Bloom out of this per-draw path.
    function getCelestialLightingState(preset = getPalette(), dimension = getDimensionAtmosphere()) {
        const sunDirection = getSunDirection();
        const sunHeight = sunDirection[1];
        const daylight = dimension ? 0 : smoothstep(-0.12, 0.16, sunHeight);
        const night = dimension ? 0 : 1 - smoothstep(-0.28, 0.04, sunHeight);
        const twilight = dimension ? 0 : clamp(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (1 - night * 0.35);
        const celestialDirection = sunHeight >= -0.04 ? sunDirection : sunDirection.map(value => -value);
        const daylightKeyColor = settings.sun_light_color_mode === 'time'
            ? mixColor(hexToRgb(settings.sun_light_day_color), hexToRgb(settings.sun_light_twilight_color), twilight)
            : hexToRgb(preset.sun);
        const moonLightColor = settings.moon_light_color_mode === 'custom'
            ? hexToRgb(settings.moon_light_custom_color)
            : hexToRgb(preset.moon);
        const sunColor = sunHeight >= -0.04 ? daylightKeyColor : moonLightColor;
        // Change hemisphere only while the caster's energy is zero.
        const sunWeight = smoothstep(-.04, .10, sunHeight);
        const moonWeight = 1 - smoothstep(-.18, -.04, sunHeight);
        const sunIntensity = settings.sun_enabled && !dimension
            ? (sunHeight >= -0.04 ? settings.sun_intensity * daylight * sunWeight : settings.moon_intensity * night * moonWeight)
            : 0;
        return { enabled: !!settings.enabled, sunDirection, celestialDirection,
            daylight, night, twilight, daylightKeyColor, sunColor, sunIntensity };
    }

    function getLightingState() {
        const preset = getPalette();
        const timedCloudLook = getEffectiveCloudAppearance();
        const cloudLook = timedCloudLook || getBaseCloudAppearance();
        const dimension = getDimensionAtmosphere();
        const cycleFrame = getReferenceCycleFrame();
        // Keep the illumination model, but an authored sky must supply its
        // current colors instead of the preset's hidden cloud phase palette.
        const cloudCycleFrame = cycleFrame || getReferenceCycleFrame(settings.time, true);
        const { sunDirection, celestialDirection, daylight, night, twilight,
            daylightKeyColor, sunColor, sunIntensity } = getCelestialLightingState(preset, dimension);

        const zenith = sampleCurrentSkyColor(1, daylight, twilight, false);
        const horizon = sampleCurrentSkyColor(SKY_HORIZON_POSITION, daylight, twilight, false);
        const ground = sampleCurrentSkyColor(0, daylight, twilight, false);
        const customCloudSky = settings.palette_mode === 'custom' && !dimension;
        const cloudPhaseTop = customCloudSky
            ? sampleCurrentSkyColor(0.85, daylight, twilight, false)
            : cloudCycleFrame?.cloudTop || [1,1,1];
        const cloudPhaseBottom = customCloudSky
            ? sampleCurrentSkyColor(0.55, daylight, twilight, false)
            : cloudCycleFrame?.cloudBottom || [1,1,1];
        const customAmbient = settings.ambient_fill_color_mode === 'custom';
        const paletteFill = (side, fallback) => {
            if (!preset[`ambient_${side}_day`]) return fallback;
            const base = mixColor(hexToRgb(preset[`ambient_${side}_night`]),
                hexToRgb(preset[`ambient_${side}_day`]), daylight);
            return mixColor(base, hexToRgb(preset[`ambient_${side}_twilight`]), twilight);
        };
        const ambientSkyColor = customAmbient
            ? hexToRgb(settings.ambient_fill_sky_color)
            : dimension ? hexToRgb(dimension.ambient) : paletteFill('sky', sampleCurrentSkyColor(0.85, daylight, twilight, false));
        const ambientGroundColor = customAmbient
            ? hexToRgb(settings.ambient_fill_ground_color)
            : dimension ? hexToRgb(dimension.ground) : paletteFill('ground', sampleCurrentSkyColor(0.25, daylight, twilight, false));
        const ambientColor = customAmbient || preset.ambient_sky_day || dimension
            ? (settings.ambient_fill_shape === 'flat'
                ? ambientSkyColor
                : mixColor(ambientGroundColor, ambientSkyColor, 0.68))
            : sampleCurrentSkyColor(0.68, daylight, twilight, false);
        const dayFill = preset.ambient_day * settings.ambient_fill_day_multiplier;
        const nightFill = preset.ambient_night * settings.ambient_fill_night_multiplier;
        const ambientIntensity = (dimension ? dimension.fill : nightFill + (dayFill - nightFill) * daylight) * settings.environment_strength;
        return {
            enabled: !!settings.enabled,
            preset: settings.preset,
            dimension: settings.dimension,
            celestialEnabled: !dimension,
            referenceCycle: !!cycleFrame,
            referenceCloudCycle: !!cloudCycleFrame,
            // The color source controls sky sampling, while the celestial
            // display style follows the clock mode even with custom colors.
            referenceCelestials: settings.sky_cycle_mode === 'reference' && !dimension,
            time: settings.time,
            daylight,
            night,
            twilight,
            sunDirection,
            celestialDirection,
            sunColor,
            sunLightColor: daylightKeyColor,
            sunIntensity,
            celestialSize: settings.celestial_size,
            moonSize: settings.moon_size,
            sunHorizonScale: settings.sun_horizon_scale,
            sunGazeScale: settings.sun_gaze_scale,
            sunGlare: settings.sun_glare,
            sunsetDirectionalGlow: settings.sunset_directional_glow,
            zenithColor: multiplyColor(zenith, settings.sky_intensity),
            horizonColor: multiplyColor(horizon, settings.sky_intensity),
            groundColor: multiplyColor(ground, settings.sky_intensity),
            cloudColor: hexToRgb(preset.cloud),
            cloudCoverage: cloudLook.cloud_coverage,
            cloudOpacity: settings.clouds_enabled && !dimension ? cloudLook.cloud_opacity : 0,
            cloudMode: settings.cloud_mode,
            cloudStyle: settings.cloud_style,
            cloudPaletteMode: settings.cloud_palette_mode,
            cloudTopColor: hexToRgb(cloudLook.cloud_top_color),
            cloudSunSideColor: hexToRgb(cloudLook.cloud_sun_side_color),
            cloudShadowSideColor: hexToRgb(cloudLook.cloud_shadow_side_color),
            cloudBottomColor: hexToRgb(cloudLook.cloud_bottom_color),
            cloudEdgeColor: hexToRgb(cloudLook.cloud_edge_color),
            cloudShadowBevelColor: hexToRgb(cloudLook.cloud_shadow_bevel_color),
            cloudScatteringStrength: cloudLook.cloud_scattering_strength,
            cloudScatteringSize: cloudLook.cloud_scattering_size,
            cloudEdgeHardness: cloudLook.cloud_edge_hardness,
            cloudViewResponse: cloudLook.cloud_view_response,
            cloudGradientThickness: cloudLook.cloud_gradient_thickness,
            cloudGradientAlpha: cloudLook.cloud_gradient_alpha,
            cloudOpticalThickness: cloudLook.cloud_optical_thickness,
            cloudPhaseAnisotropy: cloudLook.cloud_phase_anisotropy,
            cloudDensityVariation: cloudLook.cloud_density_variation,
            cloudBevelWidth: cloudLook.cloud_bevel_width,
            cloudBevelSoftness: cloudLook.cloud_bevel_softness,
            cloudBevelRoundness: cloudLook.cloud_bevel_roundness,
            cloudBevelStrength: cloudLook.cloud_bevel_strength,
            cloudBevelSmooth: settings.cloud_bevel_smooth,
            cloudBevelDistanceFade: settings.cloud_bevel_distance_fade,
            cloudBevelDistanceMinScale: cloudLook.cloud_bevel_distance_min_scale,
            cloudEdgeStrength: cloudLook.cloud_edge_strength,
            cloudShadowBevelStrength: cloudLook.cloud_shadow_bevel_strength,
            cloudLightingMode: settings.cloud_lighting_mode,
            cloudUsePalette: settings.cloud_palette_mode === 'custom' || !!timedCloudLook,
            cloudEnvironmentInfluence: cloudLook.cloud_environment_influence,
            cloudTimeTintStrength: cloudLook.cloud_time_tint_strength,
            cloudSkyTintStrength: cloudLook.cloud_sky_tint_strength,
            cloudSunTintStrength: cloudLook.cloud_sun_tint_strength,
            cloudFogEnabled: settings.cloud_fog_enabled,
            cloudFogColorMode: settings.cloud_fog_color_mode,
            cloudFogColor: hexToRgb(cloudLook.cloud_fog_color),
            cloudFogStrength: cloudLook.cloud_fog_strength,
            cloudFogStart: cloudLook.cloud_fog_start,
            cloudFogEnd: cloudLook.cloud_fog_end,
            cloudDensity: cloudLook.cloud_density,
            cloudAbsorption: cloudLook.cloud_absorption,
            cloudTranslucency: cloudLook.cloud_translucency,
            cloudBloomContribution: cloudLook.cloud_bloom_contribution,
            cloudScale: settings.cloud_scale,
            cloudDirection: settings.cloud_direction,
            cloudContrast: cloudLook.cloud_contrast,
            cloudBrightness: cloudLook.cloud_brightness,
            cloudHeight: settings.cloud_height,
            cloudThickness: settings.cloud_thickness,
            cloudExtrusion: settings.cloud_extrusion,
            cloudTime: getCloudMotionTime(),
            skyGradientPower: settings.sky_gradient_power,
            cloudPhaseTop,
            cloudPhaseBottom,
            skyGradientDomain: 'full_sky',
            starDensity: settings.star_density,
            vibrant: settings.preset === 'vibrant_visuals',
            ambientColor,
            // Sky mode follows the animated backdrop; custom mode is independent.
            ambientSkyColor,
            ambientGroundColor,
            hemisphericalFill: settings.ambient_fill_shape === 'hemisphere' ||
                (settings.ambient_fill_shape === 'preset' &&
                    (settings.preset === 'rendercraft' || settings.preset === 'cineflow' || !!dimension)),
            ambientIntensity,
            environmentIntensity: settings.environment_strength,
            bloom: getBloomSettings(),
            pixelatedShadows: settings.pixelated_shadows,
            pixelShadowSteps: settings.pixel_shadow_steps,
            pixelShadowScale: settings.pixel_shadow_scale
        };
    }

    // Palette-independent starting points: the artist keeps scene distances,
    // the sky preset and its clock. All resulting sliders remain editable.
    const DISTANCE_LOOK_PROFILES = {
        air: { opacity: 0.55, saturation: 0.9, contrast: 0.93, curve: 1.6, noise: 0.03 },
        landscape: { opacity: 0.88, saturation: 0.68, contrast: 0.78, curve: 1.25, noise: 0.07 },
        silhouette: { opacity: 1, saturation: 0.4, contrast: 0.55, curve: 0.85, noise: 0.1 }
    };

    function applyDistanceLook(id) {
        const look = DISTANCE_LOOK_PROFILES[id];
        if (!look) return false;
        applySettings({
            distance_fog_enabled: true, distance_fog_color_mode: 'sky',
            distance_fog_smoothness: 0.8, distance_fog_curve: look.curve,
            distance_fog_gradient: 0, distance_fog_sky_blend: 1,
            distance_fog_max_opacity: look.opacity, distance_fog_dither: 0.65,
            distance_fog_noise: look.noise, distance_fog_noise_scale: 24,
            distance_grade_enabled: true, distance_grade_follow_fog: true,
            distance_grade_saturation: look.saturation, distance_grade_contrast: look.contrast,
            distance_grade_curve: 1.3, distance_grade_pivot_mode: 'sky',
            distance_grade_tint_mode: 'sky', distance_grade_tint_strength: 0
        }, {cause: 'distance_look'});
        return true;
    }

    function openDistanceLookMenu(anchor) {
        const composer = Dialog.open?.id === 'lightflow_environment_composer_dialog' ? Dialog.open : null;
        environmentIdentityMenu?.delete?.();
        environmentIdentityMenu = new Menu('lightflow_environment_distance_looks',
            Object.keys(DISTANCE_LOOK_PROFILES).map(id => ({
                id: `lightflow_environment_distance_look_${id}`, name: `lightflow_environment.distance_look.${id}`, icon: 'blur_on',
                click() {
                    if (composer) {
                        // The full editor owns one edit, including Cancel. Keep
                        // its form current so the next slider cannot undo this look.
                        applyDistanceLook(id);
                        composer.form.setValues(Object.fromEntries(Object.entries(settings)
                            .filter(([key]) => key.startsWith('distance_fog_') || key.startsWith('distance_grade_'))));
                    } else {
                        runEnvironmentUndo('lightflow_environment.undo.edit', () => applyDistanceLook(id));
                    }
                    rebuildEnvironmentPanelForm();
                }
            })));
        environmentIdentityMenu.open(anchor?.currentTarget || anchor?.target || anchor);
    }

    function colorToByteArray(color) {
        return (Array.isArray(color) ? color : [1, 1, 1]).map(channel => (
            Math.round(clamp(finite(channel, 0), 0, 1) * 255)
        ));
    }

    function getDistanceFogConfig() {
        if (distanceFogCache && distanceFogCacheSettings === settings && distanceFogCacheTime === settings.time) return distanceFogCache;
        const state = getLightingState();
        const dimension = getDimensionAtmosphere();
        const mode = settings.distance_fog_color_mode;
        const dimensionFog = !!dimension && settings.dimension_fog_mode !== 'custom';
        let farColor;
        if (dimensionFog || (dimension && mode === 'sky')) {
            farColor = hexToRgb(dimension.fog);
        } else if (mode === 'fixed') {
            farColor = hexToRgb(settings.distance_fog_fixed_color);
        } else if (mode === 'time') {
            const day = hexToRgb(settings.distance_fog_day_color);
            const sunrise = hexToRgb(settings.distance_fog_sunrise_color);
            const night = hexToRgb(settings.distance_fog_night_color);
            farColor = mixColor(mixColor(night, day, state.daylight), sunrise, state.twilight);
        } else {
            farColor = state.horizonColor.map(channel => clamp(channel, 0, 1));
        }
        distanceFogCacheSettings = settings;
        distanceFogCacheTime = settings.time;
        return distanceFogCache = {
            source: 'environment',
            enabled: settings.enabled !== false && (dimensionFog || settings.distance_fog_enabled === true),
            mode: 'minecraft',
            color: colorToByteArray(farColor),
            nearColor: colorToByteArray(dimensionFog ? farColor : hexToRgb(settings.distance_fog_near_color)),
            start: dimensionFog ? (settings.dimension === 'end' ? 147.2 : 16) : settings.distance_fog_start,
            end: dimensionFog ? 160 : settings.distance_fog_end,
            density: 0,
            baseHeight: 0,
            heightFalloff: 0,
            distanceOffset: 0,
            maximumOpacity: settings.distance_fog_max_opacity,
            strictLinear: settings.distance_fog_smoothness <= 0.001,
            smoothness: settings.distance_fog_smoothness,
            curve: settings.distance_fog_curve,
            skyBlend: dimension ? 0 : settings.distance_fog_sky_blend,
            skyIntensity: settings.sky_intensity,
            skyGradientPower: settings.sky_gradient_power,
            noise: settings.distance_fog_noise,
            noiseScale: settings.distance_fog_noise_scale,
            gradientStrength: dimensionFog ? 0 : settings.distance_fog_gradient,
            dither: settings.distance_fog_dither,
            syncBackground: settings.distance_fog_sync_background
        };
    }

    function getDistanceGradeConfig() {
        const fog = settings.distance_grade_follow_fog ? getDistanceFogConfig() : null;
        const horizon = settings.distance_grade_pivot_mode === 'sky' || settings.distance_grade_tint_mode === 'sky'
            ? getLightingState().horizonColor : null;
        return {
            enabled: settings.enabled !== false && settings.distance_grade_enabled === true,
            start: fog ? fog.start : settings.distance_grade_start,
            end: fog ? fog.end : settings.distance_grade_end,
            curve: settings.distance_grade_curve,
            pivot: settings.distance_grade_pivot_mode === 'sky'
                ? clamp(horizon[0] * 0.2126 + horizon[1] * 0.7152 + horizon[2] * 0.0722, 0, 1)
                : settings.distance_grade_pivot,
            saturation: settings.distance_grade_saturation,
            contrast: settings.distance_grade_contrast,
            tint: settings.distance_grade_tint_mode === 'sky'
                ? colorToByteArray(horizon)
                : colorToByteArray(hexToRgb(settings.distance_grade_tint)),
            tintStrength: settings.distance_grade_tint_strength
        };
    }

    function syncDistanceFog(preview) {
        const atmosphere = window.LightflowAtmosphere;
        const scene = window.Canvas?.scene;
        const fog = getDistanceFogConfig();
        if (atmosphere) {
            restoreStandaloneDistanceFog(scene);
            atmosphere.updateSurfaceFogUniforms?.();
            atmosphere.prepareSurfaceFog?.(
                preview || window.Preview?.selected || window.main_preview || null,
                {
                    uniformsReady: true,
                    skipGeometryShafts: true
                }
            );
        } else if (scene && window.THREE) {
            if (!fog.enabled) {
                restoreStandaloneDistanceFog(scene);
            } else {
                const color = new THREE.Color().fromArray(fog.color.map(channel => channel / 255));
                if (!ownedDistanceFog) {
                    previousDistanceFog = scene.fog || null;
                    ownedDistanceFog = new THREE.Fog(color, fog.start, fog.end);
                } else {
                    ownedDistanceFog.color.copy(color);
                    ownedDistanceFog.near = fog.start;
                    ownedDistanceFog.far = fog.end;
                }
                scene.fog = ownedDistanceFog;
                if (fog.syncBackground !== false && (!scene.background || scene.background.isColor || scene.background === ownedDistanceFogBackground)) {
                    if (!ownedDistanceFogBackground) {
                        previousDistanceFogBackground = scene.background || null;
                        ownedDistanceFogBackground = color.clone();
                    } else {
                        ownedDistanceFogBackground.copy(color);
                    }
                    scene.background = ownedDistanceFogBackground;
                } else if (ownedDistanceFogBackground) {
                    if (scene.background === ownedDistanceFogBackground) scene.background = previousDistanceFogBackground || null;
                    ownedDistanceFogBackground = null;
                    previousDistanceFogBackground = null;
                }
            }
        }
        const enabled = fog.enabled;
        if (!atmosphere?.surfaceFogStructuralStable && lastDistanceFogEnabled !== enabled && (enabled || lastDistanceFogEnabled !== null)) {
            lastDistanceFogEnabled = enabled;
            window.Canvas?.updateAllFaces?.();
        } else lastDistanceFogEnabled = enabled;
    }

    function restoreStandaloneDistanceFog(scene = window.Canvas?.scene) {
        if (!scene) return;
        if (scene.fog === ownedDistanceFog) scene.fog = previousDistanceFog || null;
        if (scene.background === ownedDistanceFogBackground) scene.background = previousDistanceFogBackground || null;
        ownedDistanceFog = null;
        previousDistanceFog = null;
        ownedDistanceFogBackground = null;
        previousDistanceFogBackground = null;
    }

    const SKY_VERTEX = [
        'uniform mat4 uSkyProjection;',
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const SKY_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uZenith;',
        'uniform vec3 uHorizon;',
        'uniform vec3 uGround;',
        'uniform sampler2D uSkyGradient;',
        'uniform float uSkyIntensity;',
        'uniform vec3 uSunDirection;',
        'uniform vec3 uViewDirection;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uMoonColor;',
        'uniform vec3 uSunsetColor;',
        'uniform float uDaylight;',
        'uniform float uNight;',
        'uniform float uTwilight;',
        'uniform float uCelestialSize;',
        'uniform float uMoonSize;',
        'uniform float uMoonPhase;',
        'uniform float uMoonPhaseOffset;',
        'uniform vec2 uMoonAtlasGrid;',
        'uniform float uVibrant;',
        'uniform bool uVibrantCelestialCalibration;',
        'uniform float uSkyGradientPower;',
        'uniform float uReferenceCycle;',
        'uniform float uEndAtmosphere;',
        'uniform sampler2D uEndSkyTexture;',
        'uniform float uSunHorizonScale;',
        'uniform float uSunGazeScale;',
        'uniform float uSunGlare;',
        'uniform vec3 uSunGlareColor;',
        'uniform float uSunsetDirectionalGlow;',
        'uniform int uSunMode;',
        'uniform int uMoonMode;',
        'uniform int uSunBlendMode;',
        'uniform int uMoonBlendMode;',
        'uniform float uSunOpacity;',
        'uniform float uMoonOpacity;',
        'uniform bool uEnvironmentBloomPass;',
        'uniform float uSunBloomContribution;',
        'uniform float uMoonBloomContribution;',
        'uniform sampler2D uSunTexture;',
        'uniform sampler2D uMoonTexture;',
        'varying vec3 vSkyDirection;',
        'float saturate(float value) { return clamp(value, 0.0, 1.0); }',
        'float celestialBounds(vec2 uv, float facing) {',
        '    vec2 edge = min(uv, vec2(1.0) - uv);',
        '    vec2 aa = max(fwidth(uv), vec2(.00001));',
        '    vec2 coverage = smoothstep(-aa*.5, aa*.5, edge);',
        '    return coverage.x * coverage.y * step(.00001, facing);',
        '}',
        'vec3 horizontalDirection(vec3 direction) {',
        '    vec3 horizontal = vec3(direction.x, 0.0, direction.z);',
        '    float lengthSquared = dot(horizontal, horizontal);',
        '    return lengthSquared > .000001 ? horizontal * inversesqrt(lengthSquared) : vec3(1,0,0);',
        '}',
        'vec2 celestialCoordinates(vec3 direction, vec3 center) {',
        '    vec3 normalizedCenter = normalize(center);',
        '    vec3 reference = abs(normalizedCenter.y) > .96 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);',
        '    vec3 tangent = normalize(cross(reference, normalizedCenter));',
        '    vec3 bitangent = normalize(cross(normalizedCenter, tangent));',
        '    float forward = max(dot(direction, normalizedCenter), .0001);',
        '    return vec2(dot(direction, tangent), dot(direction, bitangent)) / forward;',
        '}',
        'float celestialMask(vec4 texel) {',
        '    float rgbMask = max(texel.r, max(texel.g, texel.b));',
        '    return texel.a < .999 ? texel.a : mix(step(.001,rgbMask),rgbMask,uReferenceCycle);',
        '}',
        // 0: preserve the original reference/classic preset rendering.
        // 1: alpha over, 2: additive, 3: multiplicative color filter.
        'vec3 blendCelestial(vec3 background, vec3 sprite, float alpha, int mode) {',
        '    if (mode == 2) return background + sprite * alpha;',
        '    if (mode == 3) return mix(background, background * sprite, alpha);',
        '    return mix(background, sprite, alpha);',
        '}',
        'vec4 sampleMoonAtlas(vec2 localUv) {',
        '    vec2 grid = max(floor(uMoonAtlasGrid + .5), vec2(1.0));',
        '    float frameCount = max(grid.x * grid.y, 1.0);',
        '    float frame = mod(floor(uMoonPhase + uMoonPhaseOffset + .5), frameCount);',
        '    if (frame < 0.0) frame += frameCount;',
        '    vec2 cell = vec2(mod(frame, grid.x), floor(frame / grid.x));',
        '    vec2 safeUv = clamp(localUv, vec2(.001), vec2(.999));',
        '    return texture2D(uMoonTexture, (cell + safeUv) / grid);',
        '}',
        'void main() {',
        '    vec3 direction = normalize(vSkyDirection);',
        '    float up = direction.y;',
        '    float shapedHeight = pow(saturate(abs(up)),max(.1,uSkyGradientPower));',
        '    float skyPosition = .5 + sign(up)*.5*shapedHeight;',
        '    vec3 gradientColor = texture2D(uSkyGradient,vec2(skyPosition,.5)).rgb*uSkyIntensity;',
        '    vec3 color = gradientColor;',
        '    if (uEndAtmosphere > .5) {',
        '        vec3 dominant = abs(direction);',
        '        vec2 endUv = dominant.y >= max(dominant.x,dominant.z) ? direction.xz/dominant.y : (dominant.x >= dominant.z ? direction.zy/dominant.x : direction.xy/dominant.z);',
        '        float endGrain = texture2D(uEndSkyTexture,endUv*.5+.5).r;',
        '        color *= .65 + endGrain*.7;',
        '    }',
        '',
        '    vec3 sunHorizontal = horizontalDirection(uSunDirection);',
        '    vec3 viewHorizontal = horizontalDirection(direction);',
        '    float sunFacingBase = saturate(dot(viewHorizontal,sunHorizontal));',
        '    float sunFacingSquared = sunFacingBase * sunFacingBase;',
        '    float sunFacing = sunFacingSquared * sunFacingSquared;',
        '    float horizonBand = exp(-abs(up)*7.5);',
        '    float directionalSunset = uTwilight * horizonBand * sunFacing * uSunsetDirectionalGlow;',
        '    if (uReferenceCycle > .5) color = mix(color,uSunsetColor,saturate(directionalSunset*.20));',
        '    else color += uSunsetColor * directionalSunset * (.44 + .18*uVibrant);',
        '',
        '    float horizonGrowth = 1.0-smoothstep(.035,.32,abs(uSunDirection.y));',
        '    float gazeAlignment = pow(saturate(dot(normalize(uViewDirection),uSunDirection)), 52.0);',
        '    float sunScale = mix(1.0,uSunHorizonScale,horizonGrowth) * mix(1.0,uSunGazeScale,gazeAlignment);',
        '    vec2 sunCoord = celestialCoordinates(direction,uSunDirection);',
        '    vec2 sunLocal = vec2(.5 + sunCoord.x/max(uCelestialSize*2.0*sunScale,.001), .5 - sunCoord.y/max(uCelestialSize*2.0*sunScale,.001));',
        '    float sunInside = celestialBounds(sunLocal, dot(direction,uSunDirection));',
        '    vec4 sunTexel = texture2D(uSunTexture,clamp(sunLocal,0.0,1.0));',
        '    float sunVisibility = uSunMode == 1 ? smoothstep(-.055,.015,uSunDirection.y) : 0.0;',
        '    float sunAlpha = uSunMode == 1 ? sunInside*celestialMask(sunTexel)*sunVisibility*uSunOpacity : 0.0;',
        '    if (uEnvironmentVisibilityPass) { gl_FragColor=vec4(vec3(sunAlpha),sunAlpha); return; }',
        // Vanilla RGB sprites contain a black-backed, premultiplied light halo.
        // Recover its color before alpha compositing; faint halo pixels must
        // not become an opaque dark square around the luminous core.
        '    vec3 sunDisplay = sunTexel.rgb*uSunColor / (sunTexel.a < .999 ? 1. : max(celestialMask(sunTexel),.001));',
        '    if (uVibrantCelestialCalibration && uSunBlendMode == 0 && uSunMode == 1) {',
        '        float discLuma = dot(sunDisplay,vec3(.2126,.7152,.0722));',
        '        vec3 discTint = mix(vec3(1.,.98,.95),vec3(1.,.70,.40),horizonGrowth);',
        '        discTint = mix(discTint,vec3(1.,.98,.92),smoothstep(.65,.95,discLuma)*.85);',
        '        sunDisplay = mix(vec3(discLuma),sunDisplay,.08)*discTint*1.30;',
        '    }',
        '    if (uSunBlendMode != 0) color = blendCelestial(color,sunDisplay,sunAlpha,uSunBlendMode);',
        '    else if (uReferenceCycle > .5) color = mix(color,sunDisplay,sunAlpha);',
        '    else color += sunTexel.rgb*uSunColor * sunAlpha * uDaylight;',
        '    float sunAngle = saturate(dot(direction,uSunDirection));',
        '    float tightGlare = pow(sunAngle, mix(540.0,250.0,horizonGrowth));',
        '    float broadGlare = pow(sunAngle, mix(38.0,18.0,horizonGrowth));',
        '    if (uVibrantCelestialCalibration) { tightGlare *= 1.35; broadGlare *= 1.6; }',
        '    float glareAmount = uDaylight*uSunGlare*sunVisibility*uSunOpacity*(tightGlare*.58+broadGlare*.12)*(1.0+.45*gazeAlignment);',
        '    if (uReferenceCycle > .5) color = mix(color,uSunGlareColor,saturate(glareAmount));',
        '    else color += uSunGlareColor*glareAmount;',
        '',
        '    vec3 moonDirection = -uSunDirection;',
        '    vec2 moonCoord = celestialCoordinates(direction,moonDirection);',
        '    vec2 moonLocal = vec2(.5 + moonCoord.x/max(uMoonSize*2.0,.001), .5 - moonCoord.y/max(uMoonSize*2.0,.001));',
        '    float moonInside = celestialBounds(moonLocal, dot(direction,moonDirection));',
        '    vec4 moonTexel = uMoonMode == 1 ? sampleMoonAtlas(moonLocal) : texture2D(uMoonTexture,clamp(moonLocal,0.0,1.0));',
        '    float moonVisibility = smoothstep(-.055,.015,moonDirection.y);',
        '    float moonAlpha = uMoonMode > 0 ? moonInside*celestialMask(moonTexel)*moonVisibility*uMoonOpacity : 0.0;',
        '    vec3 moonDisplay = moonTexel.rgb*uMoonColor / (moonTexel.a < .999 ? 1. : max(celestialMask(moonTexel),.001));',
        '    if (uMoonBlendMode != 0) color = blendCelestial(color,moonDisplay,moonAlpha,uMoonBlendMode);',
        '    else if (uReferenceCycle > .5) color = mix(color,moonDisplay,moonAlpha);',
        '    else color += moonTexel.rgb*uMoonColor*moonAlpha*uNight;',
        '    float moonHalo = uVibrant > .5 && uMoonMode == 1 && uMoonBlendMode != 3 ? pow(saturate(dot(direction,moonDirection)),120.)*.055*uNight*moonVisibility*uMoonOpacity : 0.;',
        '    color += uMoonColor*moonHalo;',
        '',
        '    if (uEnvironmentBloomPass) {',
        '        vec3 sunBloom = sunDisplay*sunAlpha*mix(uDaylight,1.,uReferenceCycle)*uSunBloomContribution*(uSunBlendMode == 3 ? 0.0 : 1.0);',
        '        sunBloom += uSunGlareColor*uDaylight*uSunGlare*sunVisibility*uSunOpacity*(tightGlare*.58+broadGlare*.12)*uSunBloomContribution;',
        '        vec3 moonBloom = moonDisplay*moonAlpha*mix(uNight,1.,uReferenceCycle)*uMoonBloomContribution*(uMoonBlendMode == 3 ? 0.0 : 1.0);',
        '        if (uVibrantCelestialCalibration && uSunBlendMode == 0) sunBloom *= 1.8;',
        '        moonBloom += uMoonColor*moonHalo*uMoonBloomContribution;',
        '        vec3 displayBloom = max(sunBloom+moonBloom,vec3(0));',
        '        vec3 linearBloom = mix(displayBloom/12.92,pow((displayBloom+.055)/1.055,vec3(2.4)),step(vec3(.04045),displayBloom));',
        '        float discCoverage = max(sunAlpha*(uSunBlendMode == 3 ? 0.0 : 1.0),moonAlpha*(uMoonBlendMode == 3 ? 0.0 : 1.0));',
        '        float celestialCoverage = clamp(max(discCoverage,(tightGlare+broadGlare)*sunVisibility*uSunOpacity),0.,1.);',
        '        gl_FragColor = vec4(linearBloom,celestialCoverage);',
        '        return;',
        '    }',
        '    float dither = fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)))-.5;',
        '    gl_FragColor = vec4(max(color+vec3(dither/255.0),vec3(0)),1);',
        '}'
    ].join('\n');


    const STAR_VERTEX = [
        'precision highp float;',
        'uniform mat4 uSkyProjection;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vStarDirection = normalize(mat3(modelMatrix) * position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const STAR_FRAGMENT = [
        'precision highp float;',
        'uniform float uOpacity;',
        'uniform vec3 uMoonDirection;',
        'uniform float uCelestialRadius;',
        'uniform int uMoonMode;',
        'uniform float uMoonFrame;',
        'uniform vec2 uMoonAtlasGrid;',
        'uniform sampler2D uMoonTexture;',
        'uniform bool uEnvironmentBloomPass;',
        'uniform float uStarBloomContribution;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vec3 direction = normalize(vStarDirection);',
        '    if(direction.y <= .015) discard;',
        '    if (uCelestialRadius > 0.0 && uMoonMode > 0) {',
        '        vec3 center = normalize(uMoonDirection);',
        '        float facing = dot(direction,center);',
        '        vec3 reference = abs(center.y) > .96 ? vec3(1,0,0) : vec3(0,1,0);',
        '        vec3 tangent = normalize(cross(reference,center));',
        '        vec3 bitangent = normalize(cross(center,tangent));',
        '        vec2 localUv = vec2(.5+dot(direction,tangent)/max(facing*uCelestialRadius*2.,.001),.5-dot(direction,bitangent)/max(facing*uCelestialRadius*2.,.001));',
        '        if (facing > 0.0 && min(localUv.x,localUv.y) >= 0.0 && max(localUv.x,localUv.y) <= 1.0) {',
        '            vec2 grid = max(floor(uMoonAtlasGrid+.5),vec2(1));',
        '            float frame = mod(floor(uMoonFrame+.5),grid.x*grid.y);',
        '            vec2 cell = vec2(mod(frame,grid.x),floor(frame/grid.x));',
        '            vec2 moonUv = uMoonMode == 1 ? (cell+clamp(localUv,vec2(.001),vec2(.999)))/grid : clamp(localUv,0.,1.);',
        '            vec4 texel = texture2D(uMoonTexture,moonUv);',
        '            float mask = texel.a < .999 ? texel.a : step(.001,max(texel.r,max(texel.g,texel.b)));',
        '            if (mask > .001) discard;',
        '        }',
        '    }',
        '    if (uEnvironmentBloomPass) {',
        '        vec3 linearBloom = vec3(max(uOpacity*uStarBloomContribution,0.));',
        '        gl_FragColor = vec4(linearBloom,clamp(uOpacity,0.,1.));',
        '        return;',
        '    }',
        '    gl_FragColor = vec4(vec3(1.0), clamp(uOpacity, 0.0, 1.0));',
        '}'
    ].join('\n');

    const CLOUD_VERTEX = [
        'uniform mat4 uSkyProjection;',
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    /*
     * Fancy Vanilla clouds are columns created from cloud-texture cells. This
     * shader traverses those cells with a 2D DDA while the ray is inside the
     * cloud slab, so silhouettes and side faces are geometrically coherent
     * instead of being inferred from a few displaced texture samples.
     */
    const CLOUD_FRAGMENT = `
precision highp float;
uniform vec3 uCameraWorldPosition;
uniform vec3 uCloudColor;
uniform vec3 uCloudTopColor;
uniform vec3 uCloudSunSideColor;
uniform vec3 uCloudShadowSideColor;
uniform vec3 uCloudBottomColor;
uniform vec3 uCloudPhaseTop;
uniform vec3 uCloudPhaseBottom;
uniform float uReferenceCycle;
uniform vec3 uCloudEdgeColor;
uniform vec3 uCloudShadowBevelColor;
uniform vec3 uCloudFogColor;
uniform vec3 uSunsetColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uDaylight;
uniform float uNight;
uniform float uTwilight;
uniform float uSkyIntensity;
uniform float uSkyGradientPower;
uniform float uCloudCoverage;
uniform float uCloudOpacity;
uniform float uCloudTime;
uniform float uCloudScale;
uniform float uCloudDirection;
uniform float uCloudContrast;
uniform float uCloudBrightness;
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudExtrusion;
uniform float uCloudBevelWidth;
uniform float uCloudBevelSoftness;
uniform float uCloudBevelRoundness;
uniform float uCloudBevelStrength;
uniform float uCloudBevelDistanceMinScale;
uniform float uCloudEdgeStrength;
uniform float uCloudShadowBevelStrength;
uniform float uCloudSkyTintStrength;
uniform float uCloudEnvironmentInfluence;
uniform float uCloudTimeTintStrength;
uniform bool uCloudUsePalette;
uniform bool uCloudBevelEnabled;
uniform float uCloudScatteringStrength;
uniform float uCloudScatteringSize;
uniform float uCloudEdgeHardness;
uniform float uCloudViewResponse;
uniform float uCloudGradientThickness;
uniform float uCloudGradientAlpha;
uniform float uCloudOpticalThickness;
uniform float uCloudPhaseAnisotropy;
uniform float uCloudDensityVariation;
uniform bool uVibrantCloudModel;
uniform bool uCloudDistanceEnabled;
uniform sampler2D uCloudDistanceTexture;
uniform vec3 uCloudKeyDirection;
uniform vec3 uCloudKeyColor;
uniform float uCloudKeyEnergy;
uniform float uCloudSunTintStrength;
uniform float uCloudFogStrength;
uniform float uCloudFogStart;
uniform float uCloudFogEnd;
uniform float uCloudDensity;
uniform float uCloudAbsorption;
uniform float uCloudTranslucency;
uniform float uCloudBloomContribution;
uniform bool uEnvironmentBloomPass;
uniform int uCloudMode;
uniform int uCloudStyle;
uniform int uCloudBevelSmooth;
uniform int uCloudBevelDistanceFade;
uniform int uCloudLightingMode;
uniform int uCloudFogEnabled;
uniform int uCloudFogColorMode;
uniform sampler2D uCloudTexture;
uniform sampler2D uCloudOccupancyTexture;
uniform sampler2D uSkyGradient;
uniform vec2 uCloudTextureSize;
uniform vec2 uCloudOccupancySize;
uniform int uCloudHierarchyEnabled;
uniform vec4 uCloudDerived; // motion.xy, cellSize, maxDistance
varying vec3 vSkyDirection;

float saturate(float value) { return clamp(value, 0.0, 1.0); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
        f.y
    );
}
float blockClouds(vec2 p) {
    p = floor(p * 0.5) * 0.5;
    return valueNoise(p * .18) * .58 + valueNoise(p * .43 + 17.0) * .28 + valueNoise(p * .91 + 31.0) * .14;
}
float textureAlpha(vec4 texel) {
    // Alpha-authored cloud maps do not need an RGB luminance dot product.
    if (texel.a < .999) return texel.a;
    return dot(texel.rgb, vec3(.299, .587, .114));
}
vec2 wrapCell(vec2 cell, vec2 size) {
    return mod(mod(cell, size) + size, size);
}
float cloudSourceCell(vec2 cell) {
    /*
        Procedural and texture clouds are mutually exclusive. The old form
        evaluated all three procedural noise octaves first and then overwrote
        the result for texture/vanilla modes, multiplying unused hash/noise
        work by every DDA cell visited.
    */
    float source = 0.0;
    if (uCloudMode != 0) {
        vec2 size = max(floor(uCloudTextureSize + .5), vec2(1.0));
        vec2 uv = (wrapCell(cell, size) + .5) / size;
        source = textureAlpha(texture2D(uCloudTexture, uv));
    } else {
        source = blockClouds(cell);
    }
    return source;
}
float cloudCell(vec2 cell) {
    float source = saturate((cloudSourceCell(cell) - .5) * uCloudContrast + .5);
    // main() rejects zero coverage before any cloud-cell lookup.
    return step(1.0 - uCloudCoverage, source);
}
bool cloudMacroBlockEmpty(vec2 cell) {
    if (uCloudHierarchyEnabled != 1 || uCloudCoverage >= .72) return false;
    vec2 size = max(floor(uCloudOccupancySize + .5), vec2(1.0));
    vec2 macroCell = floor(cell * .25);
    vec2 uv = (wrapCell(macroCell, size) + .5) / size;
    float maximumSource = textureAlpha(texture2D(uCloudOccupancyTexture, uv));
    float shapedMaximum = saturate((maximumSource - .5) * uCloudContrast + .5);
    return shapedMaximum < 1.0 - uCloudCoverage;
}
vec3 horizontalDirection(vec3 direction) {
    vec3 horizontal = vec3(direction.x, 0.0, direction.z);
    float lengthSquared = dot(horizontal, horizontal);
    return lengthSquared > .000001 ? horizontal * inversesqrt(lengthSquared) : vec3(1.0, 0.0, 0.0);
}
float skyGradientPosition(float height) {
    float shapedHeight = pow(saturate(abs(height)), max(.1, uSkyGradientPower));
    return .5 + sign(height) * .5 * shapedHeight;
}
vec3 sampleSkyLight(vec3 direction) {
    // Callers pass either the normalized view ray or a normalized surface normal.
    return texture2D(uSkyGradient, vec2(skyGradientPosition(direction.y), .5)).rgb * uSkyIntensity;
}
float cloudBevelProfile(
    float distanceToEdge,
    float width,
    float bevelSoftness,
    float bevelExponent
) {
    float x = saturate(distanceToEdge / max(width, .0001));
    float edgeCoordinate = distanceToEdge / max(width, .0001);
    float edgeAA = max(fwidth(edgeCoordinate) * .5, .00001);
    float hardProfile = 1.0 - smoothstep(1.0 - edgeAA, 1.0 + edgeAA, edgeCoordinate);
    float linearProfile = 1.0 - x;
    float smoothProfile = 1.0 - smoothstep(0.0, 1.0, x);
    float featheredProfile = mix(linearProfile, smoothProfile, bevelSoftness);
    featheredProfile = pow(max(featheredProfile, 0.0), bevelExponent);
    return uCloudBevelSmooth == 1 ? featheredProfile : hardProfile;
}
float cloudRoundedAlpha(
    vec2 edgeDistance,
    float width,
    float bevelSoftness,
    float bevelRoundness
) {
    vec2 inset = max(vec2(width) - edgeDistance, vec2(0.0));
    float squareLength = max(inset.x, inset.y);
    float roundedLength = length(inset);
    float profileLength = mix(squareLength, roundedLength, bevelRoundness);
    float insideDistance = width - profileLength;
    if (uCloudBevelSmooth != 1) {
        float edgeAA = max(fwidth(insideDistance) * .5, .00001);
        return smoothstep(-edgeAA, edgeAA, insideDistance);
    }
    float feather = max(width * mix(.015, .72, bevelSoftness), .00035);
    return smoothstep(0.0, feather, insideDistance);
}

vec3 vibrantDecode(vec3 color) {
    return mix(color / 12.92, pow((max(color, vec3(0.0)) + .055) / 1.055, vec3(2.4)), step(vec3(.04045), color));
}
vec3 vibrantEncode(vec3 color) {
    return mix(color * 12.92, 1.055 * pow(max(color,vec3(0.0)), vec3(1.0/2.4)) - .055, step(vec3(.0031308),color));
}
void vibrantContourCandidate(float candidate, vec2 direction, inout float best, inout vec2 outward) {
    if (candidate < best-.0001) { best = candidate; outward = direction; }
    else if (abs(candidate-best) <= .0001) outward += direction;
}
float vibrantDistance(vec2 position, out vec2 outward) {
    vec2 cell = floor(position);
    vec2 local = position-cell-.5;
    vec4 field = texture2D(uCloudDistanceTexture, fract((cell+.5)/uCloudTextureSize));
    float center = (dot(field.rg,vec2(65280.,255.))/65535.-.5)*16.;
    float flags = floor(field.b*255.+.5);
    float offset = 1.;
    outward = vec2(0.);
    if (mod(flags,2.) >= 1.) vibrantContourCandidate(-local.x,vec2(1,0),offset,outward);
    if (mod(floor(flags/2.),2.) >= 1.) vibrantContourCandidate(local.x,vec2(-1,0),offset,outward);
    if (mod(floor(flags/4.),2.) >= 1.) vibrantContourCandidate(-local.y,vec2(0,1),offset,outward);
    if (mod(floor(flags/8.),2.) >= 1.) vibrantContourCandidate(local.y,vec2(0,-1),offset,outward);
    // At a corner, the dominant coordinate determines the rectangular inset.
    vec2 diagonal = vec2(step(local.x,local.y),step(local.y,local.x));
    if (mod(floor(flags/16.),2.) >= 1.) vibrantContourCandidate(max(-local.x,-local.y),diagonal,offset,outward);
    diagonal = vec2(-step(-local.x,local.y),step(local.y,-local.x));
    if (mod(floor(flags/32.),2.) >= 1.) vibrantContourCandidate(max(local.x,-local.y),diagonal,offset,outward);
    diagonal = vec2(step(local.x,-local.y),-step(-local.y,local.x));
    if (mod(floor(flags/64.),2.) >= 1.) vibrantContourCandidate(max(-local.x,local.y),diagonal,offset,outward);
    diagonal = -vec2(step(-local.x,-local.y),step(-local.y,-local.x));
    if (mod(floor(flags/128.),2.) >= 1.) vibrantContourCandidate(max(local.x,local.y),diagonal,offset,outward);
    float normalLength = length(outward);
    if (normalLength > .0001) outward /= normalLength;
    return flags < .5 ? center : sign(center)*max(0.,abs(center)+offset);
}
float vibrantEdgeProfile(float distance, float width) {
    // Width fixes the outer limit; hardness only changes the feather inside it.
    // Even at one, derivatives retain a pixel-wide antialiased transition.
    if (width <= .0001) return 1.0;
    float aa = min(width,max(fwidth(distance),.0001));
    float feather = mix(width,aa,uCloudEdgeHardness);
    return smoothstep(max(0.0,width-feather),width,distance);
}
// An analytic single-scattering slab with a footprint-derived optical chord.
// It is an equivalent material, not RenderDragon's internal implementation.
void vibrantCloud(vec3 ray, vec3 position, vec3 normal, float hitDistance,
    float slabExit, float baseHeight, float thickness, float cellSize, vec2 motion,
    vec2 cell, float rayFootprint) {
    vec2 footprint = (position.xz + motion) / cellSize;
    float edgeDistance;
    vec2 outward = vec2(0.0);
    if (uCloudDistanceEnabled) edgeDistance = max(0.0, vibrantDistance(footprint,outward));
    else {
        vec2 local = fract(footprint);
        edgeDistance = min(min(mix(1.,local.x,1.-cloudCell(cell+vec2(-1,0))),mix(1.,1.-local.x,1.-cloudCell(cell+vec2(1,0)))),
            min(mix(1.,local.y,1.-cloudCell(cell+vec2(0,-1))),mix(1.,1.-local.y,1.-cloudCell(cell+vec2(0,1)))));
    }
    float side = 1.0 - abs(normal.y);
    float h = saturate((position.y - baseHeight) / thickness);
    float gradientAmount = (1.0-uCloudGradientAlpha)*step(.0001,uCloudGradientThickness);
    vec3 lightDirection = normalize(uCloudKeyDirection);
    float mu = clamp(dot(ray,lightDirection),-1.0,1.0);
    float facingCamera = saturate(dot(normal,-ray));
    float grazingView = 1.0-facingCamera;
    // Artist-controlled angular response, using the actual hit face and active
    // sun/moon direction. Zero preserves the original analytic slab exactly.
    float angularAmount = uCloudViewResponse*gradientAmount;
    float viewExtinction = mix(1.0,mix(.45,1.65,facingCamera),angularAmount);
    float viewLight = mix(1.0,mix(.65,1.10,grazingView*grazingView),angularAmount);
    float viewGlow = mix(1.0,mix(.30,1.80,grazingView*grazingView),
        angularAmount*(.40+.60*max(mu,0.0)));
    // One explicit rectangular support for the entire optical edge treatment.
    // Thickness is a footprint distance in cells, never an opacity/energy gain.
    float gradientWidth = uCloudGradientThickness;
    float edgeBand = (1.0-vibrantEdgeProfile(edgeDistance,gradientWidth))*gradientAmount;
    float body = 1.0-edgeBand;
    float edgeDensity = mix(.36, 1.0, body);
    edgeDensity = mix(edgeDensity, max(edgeDensity,.52), side);
    float macroDensity = 1.0-uCloudDensityVariation + uCloudDensityVariation * sin(footprint.x*.37 + sin(footprint.y*.23));
    float density = max(uCloudDensity,.05) * edgeDensity * macroDensity;
    float slabChord = max(slabExit-hitDistance,.04);
    float edgeChord = min(slabChord,(edgeDistance+.22)*2.0*cellSize*uCloudScatteringSize/max(length(ray.xz),.12));
    float chord = mix(slabChord,edgeChord,edgeBand);
    chord = min(chord, thickness * 8.0);
    float sigma = -log(max(1.0-uCloudOpacity,.0001)) * (4.2+uCloudAbsorption) / 3.0;
    float opticalDepth = max(.001, sigma * density * chord * uCloudOpticalThickness * viewExtinction);
    float transmittance = exp(-opticalDepth);
    float alpha = 1.0 - transmittance;
    float cellPixels = cellSize / max(rayFootprint * hitDistance,.0001);
    // Geometric antialiasing stays independent of gradient thickness/alpha,
    // so disabling the optical transition does not expose internal cell seams.
    vec2 local = fract(footprint);
    vec2 aa = max(fwidth(footprint)*.65,vec2(.001));
    float coverageX = min(mix(1.,smoothstep(0.,aa.x,local.x),1.-cloudCell(cell+vec2(-1,0))),
        mix(1.,smoothstep(0.,aa.x,1.-local.x),1.-cloudCell(cell+vec2(1,0))));
    float coverageZ = min(mix(1.,smoothstep(0.,aa.y,local.y),1.-cloudCell(cell+vec2(0,-1))),
        mix(1.,smoothstep(0.,aa.y,1.-local.y),1.-cloudCell(cell+vec2(0,1))));
    float coverage = mix(min(coverageX,coverageZ),1.0,side);
    alpha *= coverage * smoothstep(.35,1.1,cellPixels);
    alpha *= 1.0-smoothstep(uCloudDerived.w*.92,uCloudDerived.w,hitDistance);
    alpha *= smoothstep(.0005,.006,abs(ray.y));

    float lightHeight = max(abs(lightDirection.y),.08);
    float verticalPath = thickness * (lightDirection.y > 0.0 ? 1.0-h : h) / lightHeight;
    float sidePath = (edgeDistance+.10) * cellSize / max(length(lightDirection.xz),.10);
    float lightDepth = mix(verticalPath,min(verticalPath,sidePath),edgeBand) * density * uCloudOpticalThickness / 3.0;
    float lightTransmission = exp(-lightDepth*(.30+uCloudAbsorption));
    float g = uCloudPhaseAnisotropy;
    float phaseDenominator = max(1.0+g*g-2.0*g*mu,.08);
    float phase = (1.0-g*g) / (phaseDenominator*sqrt(phaseDenominator));
    vec3 softNormal = normalize(normal + vec3(outward.x,0.,outward.y) * (uCloudBevelEnabled && uCloudBevelWidth > .0001 ? exp(-edgeDistance/max(uCloudBevelWidth*17.5,.001)) * uCloudBevelStrength*.45 : 0.0));
    float wrappedLight = .35 + .65 * saturate(dot(softNormal,lightDirection)*.5+.5);
    float rim = edgeBand * lightTransmission;
    float skyWeight = saturate(normal.y*.5+.5);
    float sunSide = saturate(dot(horizontalDirection(normal),horizontalDirection(lightDirection))*.5+.5);
    vec3 palette = mix(uCloudShadowSideColor,uCloudSunSideColor,sunSide);
    palette = mix(palette,uCloudTopColor,saturate(normal.y));
    palette = mix(palette,uCloudBottomColor,saturate(-normal.y));
    // Palette remains an artist-owned albedo. Native VV faces are pale instead
    // of multiplying a blue surface and a blue phase into each other twice.
    vec3 albedo = vibrantDecode(palette);
    if (!uCloudUsePalette) albedo = mix(vec3(1.0),albedo,.16);
    vec3 phaseAmbient = vibrantDecode(mix(uCloudPhaseBottom,uCloudPhaseTop,.80+.12*skyWeight));
    if (uReferenceCycle < .5) phaseAmbient *= mix(.035,1.0,uDaylight);
    vec3 ambient = mix(vec3(1.0),phaseAmbient,uCloudTimeTintStrength*uCloudEnvironmentInfluence);
    if (uCloudLightingMode != 0) {
        vec3 sky = vibrantDecode(sampleSkyLight(softNormal));
        ambient = mix(ambient,uCloudLightingMode == 1 ? sky : ambient*(.58+sky*.82),uCloudSkyTintStrength*uCloudEnvironmentInfluence);
    }
    float selfShade = 1.0 - .18 * body * min(uCloudScatteringStrength,1.0);
    vec3 key = vibrantDecode(mix(vec3(1.0),uCloudKeyColor,saturate(uCloudSunTintStrength*2.5))) * uCloudKeyEnergy * uCloudEnvironmentInfluence;
    vec3 incident = ambient * selfShade * (.88+.12*skyWeight);
    incident += key * lightTransmission * (wrappedLight*.70 + phase*.055*uCloudScatteringStrength*viewGlow);
    float rimFacing = .25+.75*saturate(dot(vec3(outward.x,0.,outward.y),lightDirection));
    incident += key * rim * rimFacing * (.10+.14*saturate(mu)) * uCloudTranslucency * uCloudEdgeStrength/ .16 * uCloudScatteringStrength * viewGlow;
    vec3 radiance = albedo * incident * uCloudBrightness * viewLight;
    // Extinction and aerial in-scattering affect contrast, never the geometric
    // opacity. Thus distant clouds merge into their sky without showing stars.
    float fogCoordinate = max(0.0,(hitDistance/uCloudDerived.w-uCloudFogStart)/max(uCloudFogEnd-uCloudFogStart,.01));
    float airDepth = pow(fogCoordinate,1.35)*2.4;
    float airAmount = uCloudFogEnabled == 1 ? (1.0-exp(-airDepth*uCloudFogStrength)) * uCloudEnvironmentInfluence : 0.0;
    vec3 air = vibrantDecode(uCloudFogColorMode == 1 ? uCloudFogColor : sampleSkyLight(ray));
    air += key * pow(saturate(mu),8.0) * .025 * (1.0-abs(ray.y));
    radiance = mix(radiance,air,airAmount);
    if (uEnvironmentVisibilityPass) { gl_FragColor=vec4(0.,0.,0.,alpha); return; }
    if (uEnvironmentBloomPass) {
        gl_FragColor=vec4(max(radiance,vec3(0.0))*alpha*uCloudBloomContribution,alpha); return;
    }
    // The beauty target follows the existing display-space Environment contract;
    // the dedicated bloom target above receives uncompressed linear radiance.
    vec3 display = vibrantEncode(max(radiance,vec3(0.0)));
    float peak = max(max(display.r,display.g),display.b);
    if (peak > .93) display *= (.93+.07*(1.-exp(-(peak-.93)/.07))) / peak;
    gl_FragColor=vec4(display,alpha);
}

void main() {
    vec3 ray = normalize(vSkyDirection);
    float rayFootprint = max(length(dFdx(ray)), length(dFdy(ray)));
    if (abs(ray.y) < .0005 || uCloudOpacity <= 0.0 || uCloudCoverage < .0001) discard;

    float extrusion = mix(.025, 1.0, saturate(uCloudExtrusion));
    float baseHeight = uCloudHeight;
    float layerThickness = max(.05, uCloudThickness * extrusion);
    float topHeight = baseHeight + layerThickness;
    float firstPlane = (baseHeight - uCameraWorldPosition.y) / ray.y;
    float secondPlane = (topHeight - uCameraWorldPosition.y) / ray.y;
    float tEnter = max(min(firstPlane, secondPlane), 0.0);
    float tExit = max(firstPlane, secondPlane);
    if (tExit <= tEnter || tExit <= 0.0) discard;

    // 2.5: scale/direction/time are frame-level values. Preparing these on
    // CPU removes sqrt + sin/cos + repeated scale divisions from every cloud
    // fragment without changing the DDA or its visual result.
    float maxDistance = uCloudDerived.w;
    tExit = min(tExit, maxDistance);
    if (tExit <= tEnter) discard;

    float cellSize = uCloudDerived.z;
    vec2 motion = uCloudDerived.xy;
    float epsilon = min(.01, cellSize * .0005);
    float t = tEnter + epsilon;
    vec2 world = uCameraWorldPosition.xz + ray.xz * t + motion;
    vec2 cell = floor(world / cellSize);
    vec2 stepDirection = sign(ray.xz);
    vec2 boundary = vec2(
        stepDirection.x > 0.0 ? (cell.x + 1.0) * cellSize : cell.x * cellSize,
        stepDirection.y > 0.0 ? (cell.y + 1.0) * cellSize : cell.y * cellSize
    );
    float tMaxX = abs(ray.x) < .000001 ? 1.0e20 : t + (boundary.x - world.x) / ray.x;
    float tMaxZ = abs(ray.z) < .000001 ? 1.0e20 : t + (boundary.y - world.y) / ray.z;
    vec2 tMax = vec2(tMaxX, tMaxZ);
    vec2 tDelta = vec2(
        abs(ray.x) < .000001 ? 1.0e20 : cellSize / abs(ray.x),
        abs(ray.z) < .000001 ? 1.0e20 : cellSize / abs(ray.z)
    );

    vec3 hitNormal = ray.y > 0.0 ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0);
    float hitDistance = tEnter;
    float hit = cloudCell(cell);
    for (int iteration = 0; iteration < 112; ++iteration) {
        if (hit > .5) break;
        if (cloudMacroBlockEmpty(cell)) {
            vec2 macroCell = floor(cell * .25);
            vec2 macroBoundaryCell = vec2(
                stepDirection.x > 0.0 ? (macroCell.x + 1.0) * 4.0 : macroCell.x * 4.0,
                stepDirection.y > 0.0 ? (macroCell.y + 1.0) * 4.0 : macroCell.y * 4.0
            );
            vec2 gridOrigin = uCameraWorldPosition.xz + motion;
            float macroExitX = abs(ray.x) < .000001
                ? 1.0e20
                : (macroBoundaryCell.x * cellSize - gridOrigin.x) / ray.x;
            float macroExitZ = abs(ray.z) < .000001
                ? 1.0e20
                : (macroBoundaryCell.y * cellSize - gridOrigin.y) / ray.z;
            float macroExit = min(macroExitX, macroExitZ);
            if (macroExit > hitDistance + epsilon && macroExit <= tExit) {
                hitDistance = macroExit;
                hitNormal = macroExitX < macroExitZ
                    ? vec3(-stepDirection.x, 0.0, 0.0)
                    : vec3(0.0, 0.0, -stepDirection.y);
                float probeT = macroExit + epsilon;
                vec2 probeWorld = gridOrigin + ray.xz * probeT;
                cell = floor(probeWorld / cellSize);
                vec2 cellBoundary = vec2(
                    stepDirection.x > 0.0 ? (cell.x + 1.0) * cellSize : cell.x * cellSize,
                    stepDirection.y > 0.0 ? (cell.y + 1.0) * cellSize : cell.y * cellSize
                );
                tMax.x = abs(ray.x) < .000001
                    ? 1.0e20
                    : probeT + (cellBoundary.x - probeWorld.x) / ray.x;
                tMax.y = abs(ray.z) < .000001
                    ? 1.0e20
                    : probeT + (cellBoundary.y - probeWorld.y) / ray.z;
                hit = cloudCell(cell);
                continue;
            }
        }
        if (tMax.x < tMax.y) {
            hitDistance = tMax.x;
            if (hitDistance > tExit) break;
            cell.x += stepDirection.x;
            tMax.x += tDelta.x;
            hitNormal = vec3(-stepDirection.x, 0.0, 0.0);
        } else {
            hitDistance = tMax.y;
            if (hitDistance > tExit) break;
            cell.y += stepDirection.y;
            tMax.y += tDelta.y;
            hitNormal = vec3(0.0, 0.0, -stepDirection.y);
        }
        hit = cloudCell(cell);
    }
    if (hit < .5 || hitDistance > tExit) discard;

    vec3 hitPosition = uCameraWorldPosition + ray * hitDistance;
    vec3 shadingNormal = hitNormal;
    float bevelMask = 0.0;
    float spatialAlpha = 1.0;
    float normalizedHitDistance = saturate(hitDistance / maxDistance);
    float cloudHeightPosition = saturate((hitPosition.y - baseHeight) / layerThickness);
    if (uVibrantCloudModel) {
        vibrantCloud(ray,hitPosition,hitNormal,hitDistance,tExit,baseHeight,layerThickness,cellSize,motion,cell,rayFootprint);
        return;
    }

    if (uCloudBevelEnabled && uCloudStyle > 0 && uCloudBevelWidth > .0001) {
        vec2 localCell = fract((hitPosition.xz + motion) / cellSize);
        float distanceRatio = normalizedHitDistance;
        float distanceWidthScale = uCloudBevelDistanceFade == 1
            ? mix(1.0, clamp(uCloudBevelDistanceMinScale, .02, 1.0), distanceRatio)
            : 1.0;
        float bevelWidth = clamp(uCloudBevelWidth * distanceWidthScale, .0005, .45);
        float bevelSoftness = saturate(uCloudBevelSoftness);
        float bevelRoundness = saturate(uCloudBevelRoundness);
        float bevelExponent = mix(1.45, .62, bevelRoundness);
        /*
            2.5: On a side hit the DDA has just crossed from a cell whose
            occupancy was already proven empty. Reuse that fact for the entry
            neighbor instead of evaluating cloudCell() again. Top/bottom hits
            still sample all four neighbors exactly as before.
        */
        float emptyLeft = hitNormal.x < -0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(-1.0, 0.0));
        float emptyRight = hitNormal.x > 0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(1.0, 0.0));
        float emptyBack = hitNormal.z < -0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(0.0, -1.0));
        float emptyFront = hitNormal.z > 0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(0.0, 1.0));
        float leftDistance = mix(1.0, localCell.x, emptyLeft);
        float rightDistance = mix(1.0, 1.0 - localCell.x, emptyRight);
        float backDistance = mix(1.0, localCell.y, emptyBack);
        float frontDistance = mix(1.0, 1.0 - localCell.y, emptyFront);
        float xDistance = min(leftDistance, rightDistance);
        float zDistance = min(backDistance, frontDistance);
        float leftEdge = emptyLeft * cloudBevelProfile(localCell.x, bevelWidth, bevelSoftness, bevelExponent);
        float rightEdge = emptyRight * cloudBevelProfile(1.0 - localCell.x, bevelWidth, bevelSoftness, bevelExponent);
        float backEdge = emptyBack * cloudBevelProfile(localCell.y, bevelWidth, bevelSoftness, bevelExponent);
        float frontEdge = emptyFront * cloudBevelProfile(1.0 - localCell.y, bevelWidth, bevelSoftness, bevelExponent);
        vec3 edgeDirection = vec3(rightEdge - leftEdge, 0.0, frontEdge - backEdge);
        bevelMask = max(max(leftEdge, rightEdge), max(backEdge, frontEdge));
        float heightPosition = cloudHeightPosition;
        float yDistance = min(heightPosition, 1.0 - heightPosition);
        vec2 surfaceEdgeDistance = vec2(xDistance, zDistance);

        if (abs(hitNormal.y) < .5) {
            float lowerEdge = cloudBevelProfile(heightPosition, bevelWidth, bevelSoftness, bevelExponent);
            float upperEdge = cloudBevelProfile(1.0 - heightPosition, bevelWidth, bevelSoftness, bevelExponent);
            edgeDirection.y = upperEdge - lowerEdge;
            if (abs(hitNormal.x) > .5) {
                edgeDirection.x = 0.0;
                bevelMask = max(max(backEdge, frontEdge), max(lowerEdge, upperEdge));
                surfaceEdgeDistance = vec2(zDistance, yDistance);
            }
            if (abs(hitNormal.z) > .5) {
                edgeDirection.z = 0.0;
                bevelMask = max(max(leftEdge, rightEdge), max(lowerEdge, upperEdge));
                surfaceEdgeDistance = vec2(xDistance, yDistance);
            }
        }

        spatialAlpha = cloudRoundedAlpha(
            surfaceEdgeDistance,
            bevelWidth,
            bevelSoftness,
            bevelRoundness
        );
        float edgeLength = length(edgeDirection);
        if (edgeLength > .0001) {
            shadingNormal = normalize(hitNormal + edgeDirection / edgeLength * bevelMask * uCloudBevelStrength);
        }
    }

    float faceLight = hitNormal.y > .5 ? 1.0 : (hitNormal.y < -.5 ? .70 : (abs(hitNormal.x) > .5 ? .90 : .80));
    vec3 sunHorizontal = horizontalDirection(uSunDirection);
    vec3 dayColor;
    if (uCloudStyle > 0) {
        float upperFace = smoothstep(-.15, .72, shadingNormal.y);
        float lowerFace = 1.0 - smoothstep(-.78, -.15, shadingNormal.y);
        vec3 normalHorizontal = horizontalDirection(shadingNormal);
        float sideFacing = saturate(dot(normalHorizontal, sunHorizontal) * .5 + .5);
        vec3 sideColor = mix(uCloudShadowSideColor, uCloudSunSideColor, sideFacing);
        dayColor = mix(sideColor, uCloudTopColor, upperFace);
        dayColor = mix(dayColor, uCloudBottomColor, lowerFace);

        float diffuseKey = .82 + .18 * saturate(dot(shadingNormal, uSunDirection));
        dayColor *= diffuseKey;

        float skyTint = saturate(uCloudSkyTintStrength) * uCloudEnvironmentInfluence;
        if (skyTint > 0.0 && uCloudLightingMode != 0) {
            vec3 skyLight = max(sampleSkyLight(shadingNormal), vec3(0.0));
            if (uCloudLightingMode == 1) {
                dayColor = mix(dayColor, skyLight, skyTint);
            } else if (uCloudLightingMode == 2) {
                dayColor = mix(dayColor, dayColor * (.58 + skyLight * .82), skyTint);
            }
        }

        float sunFacing = saturate(dot(shadingNormal, uSunDirection) * .5 + .5);
        vec3 sunTint = mix(vec3(1.0), max(uSunColor, vec3(.02)), saturate(uCloudSunTintStrength) * sunFacing * uDaylight * uCloudEnvironmentInfluence);
        dayColor *= sunTint;

        float bevelFacing = saturate(dot(shadingNormal, uSunDirection) * .5 + .5);
        float highlightStrength = uCloudEdgeStrength;
        if (bevelMask > 0.0 && highlightStrength > 0.0) {
            vec3 halfDirection = normalize(uSunDirection - ray + vec3(0.0, .0001, 0.0));
            float edgeSpecularBase = saturate(dot(shadingNormal, halfDirection));
            float edgeSpecular2 = edgeSpecularBase * edgeSpecularBase;
            float edgeSpecular4 = edgeSpecular2 * edgeSpecular2;
            float edgeSpecular = edgeSpecular4 * edgeSpecular4 * edgeSpecular2;
            float bevelFacing2 = bevelFacing * bevelFacing;
            float highlightSignal = bevelMask * max(bevelFacing2, edgeSpecular * .72);
            dayColor += uCloudEdgeColor * highlightSignal * highlightStrength;
        }
        if (bevelMask > 0.0 && uCloudShadowBevelStrength > 0.0) {
            float shadowSignal = bevelMask * pow(1.0 - bevelFacing, 1.45);
            dayColor = mix(
                dayColor,
                uCloudShadowBevelColor,
                saturate(shadowSignal * uCloudShadowBevelStrength)
            );
        }
        faceLight = 1.0;
    } else {
        dayColor = uCloudColor;
        // Flat faces retain their native shading; custom/timed palettes also
        // work with Vanilla and every cloud texture source.
        if (uCloudUsePalette) {
            float sideFacing = saturate(dot(horizontalDirection(hitNormal), sunHorizontal) * .5 + .5);
            dayColor = hitNormal.y > .5 ? uCloudTopColor : (hitNormal.y < -.5
                ? uCloudBottomColor : mix(uCloudShadowSideColor, uCloudSunSideColor, sideFacing));
            float skyTint = saturate(uCloudSkyTintStrength) * uCloudEnvironmentInfluence;
            vec3 skyLight = max(sampleSkyLight(hitNormal), vec3(0.0));
            if (uCloudLightingMode == 1) dayColor = mix(dayColor, skyLight, skyTint);
            else if (uCloudLightingMode == 2) dayColor = mix(dayColor, dayColor * (.58 + skyLight * .82), skyTint);
            float sunFacing = saturate(dot(hitNormal, uSunDirection) * .5 + .5);
            dayColor *= mix(vec3(1.0), max(uSunColor, vec3(.02)), saturate(uCloudSunTintStrength) * sunFacing * uDaylight * uCloudEnvironmentInfluence);
        }
    }

    vec3 untimedColor = dayColor * faceLight * uCloudBrightness;
    vec3 cloudColor;
    if (uReferenceCycle > .5) {
        float skyFacing = smoothstep(-.7, .8, shadingNormal.y);
        vec3 phaseLight = mix(uCloudPhaseBottom, uCloudPhaseTop, skyFacing);
        // The phase palette already contains its exposure. Avoid multiplying
        // an attenuated face palette into that exposure a second time.
        float facePeak = max(max(dayColor.r, dayColor.g), dayColor.b);
        float normalization = mix(1.0, max(facePeak,.15), uCloudStyle == 2 ? 1.0 : .65);
        cloudColor = dayColor / normalization * phaseLight * uCloudBrightness;
    } else {
        vec3 nightColor = (uCloudStyle > 0 ? uCloudShadowSideColor : (uCloudUsePalette ? dayColor : uCloudColor)) * vec3(.16, .19, .27);
        dayColor *= mix(.43, 1.0, uDaylight);
        cloudColor = mix(nightColor, dayColor, 1.0 - uNight * .72) * faceLight * uCloudBrightness;
    }

    vec3 hitDirection = horizontalDirection(ray);
    float sunsetFacingBase = saturate(dot(hitDirection, sunHorizontal));
    float sunsetFacing = sunsetFacingBase * sunsetFacingBase * sunsetFacingBase;
    cloudColor = mix(cloudColor, uSunsetColor * faceLight, uTwilight * sunsetFacing * .34 * (1.0-uReferenceCycle));
    cloudColor = mix(untimedColor, cloudColor, uCloudTimeTintStrength * uCloudEnvironmentInfluence);

    if (uCloudStyle > 0) {
        float heightDepth = 1.0 - cloudHeightPosition;
        float grazingDepth = 1.0 - abs(dot(shadingNormal, -ray));
        float opticalDepth = .22 + heightDepth * .72 + grazingDepth * .48;
        cloudColor *= exp(-max(uCloudAbsorption, 0.0) * opticalDepth);
    }

    // Surface transmission, not a volume march: a pale body under backlight,
    // with narrow warm silhouettes that keep the Minecraft slab geometry.
    float forwardLight = pow(saturate(dot(ray,uSunDirection)), 6.0) * uDaylight;
    float transmission = saturate(uCloudTranslucency);
    vec3 transmittedPhase = mix(vec3(1.0), mix(uCloudPhaseTop, vec3(1.0), .45), uCloudTimeTintStrength);
    vec3 transmittedColor = transmittedPhase * mix(vec3(1.),uSunColor,.32);
    transmittedColor = mix(vec3(1.0), transmittedColor, uCloudEnvironmentInfluence);
    cloudColor = mix(cloudColor, max(cloudColor,transmittedColor), forwardLight * transmission * .65);
    if (uCloudStyle == 2) {
        float wrappedEdge = bevelMask * (.25 + .75 * forwardLight);
        cloudColor += uCloudEdgeColor * wrappedEdge * transmission * uDaylight * .24;
    }

    float fogAmount = 0.0;
    if (uCloudFogEnabled == 1 && uCloudFogStrength > 0.0) {
        float fogDistance = normalizedHitDistance;
        fogAmount = smoothstep(
            min(uCloudFogStart, uCloudFogEnd - .001),
            max(uCloudFogEnd, uCloudFogStart + .001),
            fogDistance
        ) * saturate(uCloudFogStrength) * uCloudEnvironmentInfluence;
        vec3 fogColor = uCloudFogColorMode == 1 ? uCloudFogColor : sampleSkyLight(ray);
        cloudColor = mix(cloudColor, fogColor, fogAmount);
    }

    float distanceFade = 1.0 - smoothstep(maxDistance * .70, maxDistance, hitDistance);
    float horizonFade = smoothstep(.002, .035, abs(ray.y));
    float materialOpacity = uCloudOpacity;
    if (uCloudStyle > 0) {
        materialOpacity = 1.0 - pow(max(1.0 - uCloudOpacity, .0001), max(uCloudDensity, .05));
    }
    float alpha = materialOpacity * spatialAlpha * distanceFade * horizonFade;
    if (uCloudStyle > 0) {
        // A distant voxel smaller than a pixel otherwise flashes between
        // fully present and absent as the camera moves. Fade only that
        // unresolved detail; Studio supersampling naturally retains more.
        float cellPixels = cellSize / max(rayFootprint * hitDistance, .00001);
        alpha *= smoothstep(.75, 1.75, cellPixels);
    }
    alpha *= mix(1.0, .68, fogAmount);
    if (uCloudStyle == 2 && uCloudOpacity < .999) alpha *= 1.0 - bevelMask * transmission * .18;
    if (uEnvironmentVisibilityPass) { gl_FragColor=vec4(0.,0.,0.,clamp(alpha,0.,1.)); return; }
    if (uEnvironmentBloomPass) {
        vec3 emission = max(cloudColor, vec3(0.0));
        emission = mix(emission/12.92,pow((emission+.055)/1.055,vec3(2.4)),step(vec3(.04045),emission));
        vec3 linearBloom = emission * alpha * max(uCloudBloomContribution, 0.0);
        gl_FragColor = vec4(
            linearBloom,
            clamp(alpha, 0.0, 1.0)
        );
        return;
    }
    vec3 displayColor = max(cloudColor, vec3(0.0));
    if (uCloudStyle > 0) {
        // Preserve the face palette as bright clouds approach display white.
        // Bloom above retains the uncompressed signal; the shoulder only
        // replaces per-channel clipping in the displayed Rendercraft cloud.
        float peak = max(max(displayColor.r, displayColor.g), displayColor.b);
        if (peak > .8) {
            float shoulder = .8 + .2 * (1.0 - exp(-(peak - .8) / .2));
            displayColor *= shoulder / peak;
        }
    }
    gl_FragColor = vec4(displayColor, alpha);
}`;

    class JavaRandom {
        constructor(seed) {
            this.mask = (1n << 48n) - 1n;
            this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & this.mask;
        }
        next(bits) {
            this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & this.mask;
            return Number(this.seed >> BigInt(48 - bits));
        }
        nextFloat() {
            return this.next(24) / 16777216;
        }
        nextDouble() {
            return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
        }
    }

    function createVanillaStarGeometry(maxAttempts = 6000) {
        const random = new JavaRandom(10842);
        const positions = [];
        const indices = [];
        const attemptCounts = new Uint32Array(maxAttempts + 1);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let x = random.nextFloat() * 2 - 1;
            let y = random.nextFloat() * 2 - 1;
            let z = random.nextFloat() * 2 - 1;
            const size = 0.15 + random.nextFloat() * 0.1;
            let lengthSquared = x * x + y * y + z * z;
            if (lengthSquared < 1 && lengthSquared > 0.01) {
                const inverseLength = 1 / Math.sqrt(lengthSquared);
                x *= inverseLength;
                y *= inverseLength;
                z *= inverseLength;
                const centerX = x * 100;
                const centerY = y * 100;
                const centerZ = z * 100;
                const longitude = Math.atan2(x, z);
                const sinLongitude = Math.sin(longitude);
                const cosLongitude = Math.cos(longitude);
                const latitude = Math.atan2(Math.sqrt(x * x + z * z), y);
                const sinLatitude = Math.sin(latitude);
                const cosLatitude = Math.cos(latitude);
                const roll = random.nextDouble() * TWO_PI;
                const sinRoll = Math.sin(roll);
                const cosRoll = Math.cos(roll);
                const firstVertex = positions.length / 3;
                for (let corner = 0; corner < 4; corner++) {
                    const localX = ((corner & 2) - 1) * size;
                    const localY = (((corner + 1) & 2) - 1) * size;
                    const rotatedX = localX * cosRoll - localY * sinRoll;
                    const rotatedY = localY * cosRoll + localX * sinRoll;
                    const vertical = rotatedX * sinLatitude;
                    const radial = -rotatedX * cosLatitude;
                    const offsetX = radial * sinLongitude - rotatedY * cosLongitude;
                    const offsetZ = rotatedY * sinLongitude + radial * cosLongitude;
                    positions.push(centerX + offsetX, centerY + vertical, centerZ + offsetZ);
                }
                indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
            }
            attemptCounts[attempt + 1] = indices.length;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        return { geometry, attemptCounts };
    }

    let orthographicSkyCamera = null;
    function updateSkyProjection(material, camera) {
        if (!material?.uniforms?.uSkyProjection || !camera) return;
        if (!camera.isOrthographicCamera) {
            material.uniforms.uSkyProjection.value.copy(camera.projectionMatrix);
            return;
        }
        // Give an orthographic artwork a full-size, rotation-following sky.
        // The virtual perspective is shared by sky, clouds and stars, and its
        // view offset is the exact Studio tile/jitter window of the full frame.
        if (!orthographicSkyCamera) orthographicSkyCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
        const proxy = orthographicSkyCamera;
        proxy.aspect = Math.abs((camera.right - camera.left) / Math.max(Math.abs(camera.top - camera.bottom), 0.0001));
        proxy.clearViewOffset();
        const view = camera.view;
        if (view?.enabled) proxy.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
        proxy.updateProjectionMatrix();
        material.uniforms.uSkyProjection.value.copy(proxy.projectionMatrix);
    }

    function createVanillaStars() {
        if (!window.THREE || !window.Canvas?.scene || starMesh) return;
        const generated = createVanillaStarGeometry();
        starAttemptIndexCounts = generated.attemptCounts;
        starMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Stars',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uOpacity: { value: 0 },
                uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
                uCelestialRadius: { value: settings.celestial_size },
                uMoonMode: { value: 0 },
                uMoonFrame: { value: 0 },
                uMoonAtlasGrid: { value: new THREE.Vector2(4,2) },
                uMoonTexture: { value: vanillaMoonPhasesTexture || missingSkyTexture || fallbackTexture },
                uEnvironmentBloomPass: { value: false },
                uStarBloomContribution: { value: settings.star_bloom_contribution }
            },
            vertexShader: STAR_VERTEX,
            fragmentShader: STAR_FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            fog: false,
            toneMapped: false
        });
        starMesh = new THREE.Mesh(generated.geometry, starMaterial);
        starMesh.name = 'Lightflow Vanilla Stars';
        starMesh.frustumCulled = false;
        configureBloomDepthMaterial(starMaterial);
        starMesh.renderOrder = -99999;
        starMesh.userData.lightflowEnvironment = true;
        starMesh.userData.lightflowEnvironmentBloomComponent = 'stars';
        starMesh.onBeforeRender = (_renderer, _scene, camera) => updateSkyProjection(starMaterial, camera);
        Canvas.scene.add(starMesh);
    }

    function getTextureSize(texture, fallbackWidth = 256, fallbackHeight = 256) {
        const image = texture?.image || texture?.source?.data;
        return [
            Math.max(1, finite(image?.naturalWidth || image?.videoWidth || image?.width, fallbackWidth)),
            Math.max(1, finite(image?.naturalHeight || image?.videoHeight || image?.height, fallbackHeight))
        ];
    }

    function createVoxelClouds() {
        if (!window.THREE || !window.Canvas?.scene || cloudMesh) return;
        cloudMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Voxel_Clouds',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uCloudTopColor: { value: new THREE.Color(0xfbfdff) },
                uCloudPhaseTop: { value: new THREE.Color(1,1,1) },
                uCloudPhaseBottom: { value: new THREE.Color(1,1,1) },
                uReferenceCycle: { value: 0 },
                uCloudSunSideColor: { value: new THREE.Color(0xe8f1f8) },
                uCloudShadowSideColor: { value: new THREE.Color(0xc6d5e4) },
                uCloudBottomColor: { value: new THREE.Color(0x9caec4) },
                uCloudEdgeColor: { value: new THREE.Color(0xfff4c2) },
                uCloudShadowBevelColor: { value: new THREE.Color(0x8fa4b8) },
                uCloudFogColor: { value: new THREE.Color(0xbdd6ff) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uSkyIntensity: { value: settings.sky_intensity },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion },
                uCloudBevelWidth: { value: settings.cloud_bevel_width },
                uCloudBevelSoftness: { value: settings.cloud_bevel_softness },
                uCloudBevelRoundness: { value: settings.cloud_bevel_roundness },
                uCloudBevelStrength: { value: settings.cloud_bevel_strength },
                uCloudBevelDistanceMinScale: { value: settings.cloud_bevel_distance_min_scale },
                uCloudEdgeStrength: { value: settings.cloud_edge_strength },
                uCloudShadowBevelStrength: { value: settings.cloud_shadow_bevel_strength },
                uCloudSkyTintStrength: { value: settings.cloud_sky_tint_strength },
                uCloudEnvironmentInfluence: { value: settings.cloud_environment_influence },
                uCloudTimeTintStrength: { value: settings.cloud_time_tint_strength },
                uCloudUsePalette: { value: false },
                uCloudBevelEnabled: { value: settings.cloud_bevel_enabled },
                uCloudScatteringStrength: { value: settings.cloud_scattering_strength },
                uCloudScatteringSize: { value: settings.cloud_scattering_size },
                uCloudEdgeHardness: { value: settings.cloud_edge_hardness },
                uCloudViewResponse: { value: settings.cloud_view_response },
                uCloudGradientThickness: { value: settings.cloud_gradient_thickness },
                uCloudGradientAlpha: { value: settings.cloud_gradient_alpha },
                uCloudOpticalThickness: { value: settings.cloud_optical_thickness },
                uCloudPhaseAnisotropy: { value: settings.cloud_phase_anisotropy },
                uCloudDensityVariation: { value: settings.cloud_density_variation },
                uVibrantCloudModel: { value: false },
                uCloudDistanceEnabled: { value: false },
                uCloudDistanceTexture: { value: fallbackTexture },
                uCloudKeyDirection: { value: new THREE.Vector3(0,1,0) },
                uCloudKeyColor: { value: new THREE.Color(1,1,1) },
                uCloudKeyEnergy: { value: 0 },
                uCloudSunTintStrength: { value: settings.cloud_sun_tint_strength },
                uCloudFogStrength: { value: settings.cloud_fog_strength },
                uCloudFogStart: { value: settings.cloud_fog_start },
                uCloudFogEnd: { value: settings.cloud_fog_end },
                uCloudDensity: { value: settings.cloud_density },
                uCloudAbsorption: { value: settings.cloud_absorption },
                uCloudTranslucency: { value: settings.cloud_translucency },
                uCloudBloomContribution: { value: settings.cloud_bloom_contribution },
                uEnvironmentBloomPass: { value: false },
                uCloudMode: { value: 1 },
                uCloudStyle: { value: 0 },
                uCloudBevelSmooth: { value: settings.cloud_bevel_smooth ? 1 : 0 },
                uCloudBevelDistanceFade: { value: settings.cloud_bevel_distance_fade ? 1 : 0 },
                uCloudLightingMode: { value: settings.cloud_lighting_mode === 'sky' ? 1 : (settings.cloud_lighting_mode === 'mixed' ? 2 : 0) },
                uCloudFogEnabled: { value: settings.cloud_fog_enabled ? 1 : 0 },
                uCloudFogColorMode: { value: settings.cloud_fog_color_mode === 'custom' ? 1 : 0 },
                uCloudTexture: { value: vanillaCloudTexture || missingSkyTexture || fallbackTexture },
                uCloudOccupancyTexture: { value: fallbackTexture },
                uSkyGradient: { value: skyGradientTexture || fallbackTexture },
                uCloudTextureSize: { value: new THREE.Vector2(256, 256) },
                uCloudOccupancySize: { value: new THREE.Vector2(1, 1) },
                uCloudHierarchyEnabled: { value: 0 },
                uCloudDerived: { value: new THREE.Vector4(0, 0, 12, 1536) }
            },
            vertexShader: CLOUD_VERTEX,
            fragmentShader: CLOUD_FRAGMENT,
            extensions: { derivatives: true },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.BackSide,
            fog: false,
            toneMapped: false
        });
        cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), cloudMaterial);
        configureBloomDepthMaterial(cloudMaterial);
        cloudMesh.name = 'Lightflow Vanilla Voxel Clouds';
        cloudMesh.frustumCulled = false;
        cloudMesh.renderOrder = -99998;
        cloudMesh.userData.lightflowEnvironment = true;
        cloudMesh.userData.lightflowEnvironmentBloomComponent = 'clouds';
        cloudMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!cloudMaterial || !camera) return;
            updateSkyProjection(cloudMaterial, camera);
            camera.getWorldPosition?.(cloudMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(cloudMesh);
    }

    function updateVanillaStars(state) {
        if (!starMesh || !starMaterial || !starAttemptIndexCounts) return;
        const attempts = Math.round(clamp(settings.star_density, .1, 4) * 1500);
        const safeAttempt = Math.min(attempts, starAttemptIndexCounts.length - 1);
        starMesh.geometry.setDrawRange(0, starAttemptIndexCounts[safeAttempt]);
        starMaterial.uniforms.uOpacity.value = settings.stars_enabled
            ? clamp(state.night * settings.star_brightness, 0, 1)
            : 0;
        starMaterial.uniforms.uStarBloomContribution.value = settings.star_bloom_contribution;
        starMaterial.uniforms.uMoonDirection.value.fromArray(state.sunDirection).multiplyScalar(-1);
        starMaterial.uniforms.uCelestialRadius.value = settings.moon_mode === 'hidden' ? 0 : settings.moon_size;
        starMesh.visible = !!(settings.enabled && state.celestialEnabled && settings.stars_enabled && starMaterial.uniforms.uOpacity.value > .0005);
        const orbit = mod(settings.time, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const orbitRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), orbit);
        const azimuthRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -azimuth);
        starMesh.quaternion.copy(azimuthRotation).multiply(orbitRotation);
    }

    const LENS_FLARE_FRAGMENT = `
uniform sampler2D uVisibility;
uniform vec2 uSunUv;
uniform vec4 uViewWindow;
uniform float uAspect;
uniform float uStrength;
uniform float uScale;
uniform vec3 uColor;
varying vec2 vUv;
float square(vec2 p,float radius) {
    // Procedural Minecraft-style quads have hard pixel edges, not a soft fringe.
    return step(max(abs(p.x),abs(p.y)),radius);
}
void main() {
    vec2 texel=vec2(1.0/128.0);
    float visibility=texture2D(uVisibility,uSunUv).r;
    visibility=max(visibility,texture2D(uVisibility,clamp(uSunUv+vec2(texel.x,0.),vec2(0.),vec2(1.))).r*.88);
    visibility=max(visibility,texture2D(uVisibility,clamp(uSunUv-vec2(texel.x,0.),vec2(0.),vec2(1.))).r*.88);
    visibility=max(visibility,texture2D(uVisibility,clamp(uSunUv+vec2(0.,texel.y),vec2(0.),vec2(1.))).r*.88);
    visibility=max(visibility,texture2D(uVisibility,clamp(uSunUv-vec2(0.,texel.y),vec2(0.),vec2(1.))).r*.88);
    if(visibility*uStrength<.0001) discard;
    vec2 uv=uViewWindow.xy+vUv*uViewWindow.zw;
    vec2 axis=vec2(.5)-uSunUv;
    vec2 p=(uv-uSunUv)*vec2(uAspect,1.);
    float streak=exp(-abs(p.y)/.0015)*exp(-abs(p.x)/(.14*uScale));
    streak+=exp(-abs(p.x)/.0012)*exp(-abs(p.y)/(.055*uScale))*.28;
    vec3 color=uColor*streak*.16;
    vec2 ghost=(uv-(uSunUv+axis*.65))*vec2(uAspect,1.);
    color+=vec3(.65,.88,1.)*square(ghost,.026*uScale)*.055;
    ghost=(uv-(uSunUv+axis*1.2))*vec2(uAspect,1.);
    float outer=square(ghost,.057*uScale),inner=square(ghost,.046*uScale);
    color+=vec3(.77,.65,1.)*(outer-inner*.88)*.045;
    ghost=(uv-(uSunUv+axis*1.65))*vec2(uAspect,1.);
    color+=vec3(1.,.77,.42)*square(ghost,.018*uScale)*.085;
    ghost=(uv-(uSunUv+axis*2.05))*vec2(uAspect,1.);
    color+=vec3(.58,.86,.83)*square(ghost,.037*uScale)*.04;
    gl_FragColor=vec4(color*visibility*uStrength,0.);
}`;

    function getLensForegroundTransmission(camera, direction, hasDepth) {
        if (hasDepth) return 1;
        // Standalone Environment has no shared depth buffer. Raycast only in
        // that case, retaining alpha-cutout holes and translucent surfaces.
        const origin = camera.getWorldPosition(new THREE.Vector3());
        const ray = new THREE.Raycaster(origin, direction, .01, 100000);
        const meshes = [];
        Canvas.scene.traverse(object => {
            if (!object.isMesh || object.userData?.lightflowEnvironment || object.userData?.lightflowGizmo) return;
            for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
            meshes.push(object);
        });
        let transmission = 1;
        let previousHit = null;
        for (const hit of ray.intersectObjects(meshes, false)) {
            if (previousHit && previousHit.object === hit.object && Math.abs(previousHit.distance-hit.distance)<.0001) continue;
            previousHit = hit;
            const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material;
            if (!material || material.visible === false) continue;
            const uniforms = material.uniforms;
            let alpha = uniforms?.uBaseAlpha
                ? uniforms.uBaseAlpha.value
                : (material.opacity === undefined ? 1 : material.opacity);
            const map = material.map || uniforms?.map?.value || uniforms?.uBaseColorMap?.value;
            if (map?.image && hit.uv) {
                try {
                    if (!lensAlphaProbe) { lensAlphaProbe=document.createElement('canvas');lensAlphaProbe.width=lensAlphaProbe.height=1; }
                    const uv=hit.uv.clone();map.transformUv?.(uv);
                    const image=map.image, width=image.naturalWidth||image.width, height=image.naturalHeight||image.height;
                    const context=lensAlphaProbe.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,1,1);
                    context.drawImage(image,Math.min(width-1,Math.max(0,Math.floor(uv.x*width))),Math.min(height-1,Math.max(0,Math.floor(uv.y*height))),1,1,0,0,1,1);
                    alpha*=context.getImageData(0,0,1,1).data[3]/255;
                } catch (_) { /* An unreadable texture retains conservative geometry occlusion. */ }
            }
            const cutoff = uniforms?.SA_ALPHA_CUTOFF?.value ?? material.alphaTest;
            if (alpha < (cutoff || .001)) continue;
            transmission *= 1-clamp(alpha,0,1);
            if (transmission < .001) return 0;
        }
        return transmission;
    }

    function prepareLensFlare(renderer, camera) {
        lensFlareMaterial.uniforms.uStrength.value = 0;
        if (!environmentRuntimeLoaded || !settings.lens_flare_enabled || !skyMesh?.visible || settings.sun_mode === 'hidden' || settings.dimension !== 'overworld') return;
        const state=getLightingState();if (state.sunDirection[1]<-.055) return;
        const sourceCamera=camera.clone();
        camera.getWorldPosition(sourceCamera.position);camera.getWorldQuaternion(sourceCamera.quaternion);
        const view=camera.view;
        sourceCamera.clearViewOffset?.();
        if (sourceCamera.isPerspectiveCamera && view?.enabled) sourceCamera.aspect=view.fullWidth/view.fullHeight;
        sourceCamera.updateProjectionMatrix();sourceCamera.updateMatrixWorld(true);
        updateSkyProjection(skyMaterial,sourceCamera);
        const sunDirection=new THREE.Vector3().fromArray(state.sunDirection);
        const cameraDirection=sunDirection.clone().transformDirection(sourceCamera.matrixWorldInverse);
        const clip=new THREE.Vector4(cameraDirection.x,cameraDirection.y,cameraDirection.z,0).applyMatrix4(skyMaterial.uniforms.uSkyProjection.value);
        if(clip.w<=0) {updateSkyProjection(skyMaterial,camera);return;}
        const sunUv=new THREE.Vector2(clip.x/clip.w*.5+.5,clip.y/clip.w*.5+.5);
        if(sunUv.x<0||sunUv.x>1||sunUv.y<0||sunUv.y>1) {updateSkyProjection(skyMaterial,camera);return;}
        if(!lensVisibilityTarget) lensVisibilityTarget=new THREE.WebGLRenderTarget(128,128,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:false,stencilBuffer:false});
        if(!lensVisibilityScene) {
            lensVisibilityScene=new THREE.Scene();
            for(const original of [skyMesh,cloudMesh]) {
                const proxy=new THREE.Mesh(original.geometry,original.material);proxy.frustumCulled=false;proxy.renderOrder=original.renderOrder;
                proxy.onBeforeRender=original.onBeforeRender;proxy.userData.source=original;lensVisibilityScene.add(proxy);
            }
        }
        const preview=window.Preview?.all?.find?.(item=>item.renderer===renderer) || window.Preview?.selected;
        const depth=!view?.enabled ? window.LightflowFramePipeline?.getFrameResources?.(preview)?.depthTexture : null;
        const gate=getLensForegroundTransmission(sourceCamera,sunDirection,!!depth);
        const previousTarget=renderer.getRenderTarget(),previousClear=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha(),previousAutoClear=renderer.autoClear;
        // Three r129 restores all MRT attachments when rebinding a target.
        // Preserve the caller's color-only routing as well as its framebuffer;
        // Shader Architect caches that routing across individual scene draws.
        const gl = renderer.getContext();
        const previousDrawBuffers = Array.isArray(previousTarget?.texture) && typeof gl.drawBuffers === 'function'
            ? previousTarget.texture.map((_, index) => gl.getParameter(gl.DRAW_BUFFER0 + index))
            : null;
        const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
        const snapshots = [skyMaterial, cloudMaterial].map(material => ({
            material,
            blending: material.blending,
            transparent: material.transparent,
            src: material.blendSrc,
            dst: material.blendDst,
            equation: material.blendEquation,
            srcAlpha: material.blendSrcAlpha,
            dstAlpha: material.blendDstAlpha,
            equationAlpha: material.blendEquationAlpha,
            bloom: material.uniforms.uEnvironmentBloomPass.value,
            visibility: material.uniforms.uEnvironmentVisibilityPass.value,
            depth: material.uniforms.uEnvironmentSceneDepth.value,
            hasDepth: material.uniforms.uEnvironmentHasDepth.value,
            depthSize: material.uniforms.uEnvironmentDepthSize.value.clone()
        }));
        try {
            for(const proxy of lensVisibilityScene.children) proxy.visible=proxy.userData.source.visible;
            for(const {material} of snapshots) {
                material.uniforms.uEnvironmentBloomPass.value=true;material.uniforms.uEnvironmentVisibilityPass.value=true;
                material.uniforms.uEnvironmentHasDepth.value=!!depth;material.uniforms.uEnvironmentSceneDepth.value=depth||fallbackTexture;
                material.uniforms.uEnvironmentDepthSize.value.set(128,128);
                material.transparent=true;material.blending=THREE.CustomBlending;material.blendEquation=material.blendEquationAlpha=THREE.AddEquation;
                material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneMinusSrcAlphaFactor;
                material.blendSrcAlpha=THREE.OneFactor;material.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
            }
            renderer.autoClear=false;renderer.setRenderTarget(lensVisibilityTarget);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear();
            renderer.render(lensVisibilityScene,sourceCamera);
        } finally {
            for(const s of snapshots) {
                const m=s.material;m.blending=s.blending;m.transparent=s.transparent;m.blendSrc=s.src;m.blendDst=s.dst;m.blendEquation=s.equation;m.blendSrcAlpha=s.srcAlpha;m.blendDstAlpha=s.dstAlpha;m.blendEquationAlpha=s.equationAlpha;
                m.uniforms.uEnvironmentBloomPass.value=s.bloom;m.uniforms.uEnvironmentVisibilityPass.value=s.visibility;m.uniforms.uEnvironmentSceneDepth.value=s.depth;m.uniforms.uEnvironmentHasDepth.value=s.hasDepth;m.uniforms.uEnvironmentDepthSize.value.copy(s.depthSize);
                updateSkyProjection(m,camera);camera.getWorldPosition?.(m.uniforms.uCameraWorldPosition.value);
            }
            renderer.setRenderTarget(previousTarget);if(!previousTarget){renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest)}
            if (previousDrawBuffers) gl.drawBuffers(previousDrawBuffers);
            renderer.setClearColor(previousClear,previousAlpha);renderer.autoClear=previousAutoClear;
        }
        const u=lensFlareMaterial.uniforms;u.uVisibility.value=lensVisibilityTarget.texture;u.uSunUv.value.copy(sunUv);
        u.uViewWindow.value.set(view?.enabled?view.offsetX/view.fullWidth:0,view?.enabled?1-(view.offsetY+view.height)/view.fullHeight:0,view?.enabled?view.width/view.fullWidth:1,view?.enabled?view.height/view.fullHeight:1);
        u.uAspect.value=sourceCamera.isPerspectiveCamera?sourceCamera.aspect:Math.abs((sourceCamera.right-sourceCamera.left)/(sourceCamera.top-sourceCamera.bottom));
        u.uStrength.value=settings.lens_flare_strength*gate*state.daylight;u.uScale.value=settings.lens_flare_scale;
        u.uColor.value.fromArray(state.sunLightColor);
    }

    function createLensFlare() {
        if (lensFlareMesh || !skyMesh || !cloudMesh) return;
        lensFlareMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Minecraft_Lens_Flare',
            uniforms: {
                uVisibility: { value: fallbackTexture },
                uSunUv: { value: new THREE.Vector2() },
                uViewWindow: { value: new THREE.Vector4(0, 0, 1, 1) },
                uAspect: { value: 1 },
                uStrength: { value: 0 },
                uScale: { value: 1 },
                uColor: { value: new THREE.Color() }
            },
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
            fragmentShader: LENS_FLARE_FRAGMENT,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor
        });
        lensFlareMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensFlareMaterial);
        lensFlareMesh.name = 'Lightflow Minecraft Lens Flare';
        lensFlareMesh.visible = false;
        lensFlareMesh.frustumCulled = false;
        lensFlareMesh.renderOrder = 100000;
        lensFlareMesh.userData.lightflowEnvironment = true;
        lensFlareMesh.onBeforeRender = (renderer, _scene, camera) => prepareLensFlare(renderer, camera);
        Canvas.scene.add(lensFlareMesh);
    }

    function createSky() {
        if (!window.THREE || !window.Canvas?.scene) return false;
        if (skyMesh) {
            createVanillaStars();
            createVoxelClouds();
            createLensFlare();
            return false;
        }
        ensureSkyTextures();
        ensureSkyGradientTexture();
        skyMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Minecraft_Sky',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uZenith: { value: new THREE.Color(0x78a7ff) },
                uHorizon: { value: new THREE.Color(0xb8d2ff) },
                uGround: { value: new THREE.Color(0x536b78) },
                uSkyGradient: { value: skyGradientTexture },
                uSkyIntensity: { value: settings.sky_intensity },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uViewDirection: { value: new THREE.Vector3(0, 0, -1) },
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uMoonColor: { value: new THREE.Color(0xdbe4ff) },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uCelestialSize: { value: settings.celestial_size },
                uEndAtmosphere: { value: 0 },
                uEndSkyTexture: { value: endSkyTexture || missingSkyTexture || fallbackTexture },
                uMoonSize: { value: settings.moon_size },
                uReferenceCycle: { value: 0 },
                uMoonPhase: { value: settings.moon_phase },
                uMoonPhaseOffset: { value: settings.moon_phase_offset },
                uMoonAtlasGrid: { value: new THREE.Vector2(4, 2) },
                uStars: { value: settings.star_brightness },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uVibrant: { value: 0 },
                uVibrantCelestialCalibration: { value: false },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uStarDensity: { value: settings.star_density },
                uSunHorizonScale: { value: settings.sun_horizon_scale },
                uSunGazeScale: { value: settings.sun_gaze_scale },
                uSunGlare: { value: settings.sun_glare },
                uSunGlareColor: { value: new THREE.Color(0xffffff) },
                uSunsetDirectionalGlow: { value: settings.sunset_directional_glow },
                uSunMode: { value: 1 },
                uMoonMode: { value: 1 },
                uSunBlendMode: { value: 0 },
                uMoonBlendMode: { value: 0 },
                uSunOpacity: { value: settings.sun_opacity },
                uMoonOpacity: { value: settings.moon_opacity },
                uEnvironmentBloomPass: { value: false },
                uSunBloomContribution: { value: settings.sun_bloom_contribution },
                uMoonBloomContribution: { value: settings.moon_bloom_contribution },
                uCloudMode: { value: 1 },
                uSunTexture: { value: vanillaSunTexture || missingSkyTexture || fallbackTexture },
                uMoonTexture: { value: vanillaMoonPhasesTexture || missingSkyTexture || fallbackTexture },
                uCloudTexture: { value: vanillaCloudTexture || missingSkyTexture || fallbackTexture },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion }
            },
            vertexShader: SKY_VERTEX,
            fragmentShader: SKY_FRAGMENT,
            extensions: { derivatives: true },
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: true,
            fog: false,
            transparent: false,
            toneMapped: false
        });
        skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skyMaterial);
        configureBloomDepthMaterial(skyMaterial);
        skyMesh.name = 'Lightflow Environment Sky';
        skyMesh.frustumCulled = false;
        skyMesh.renderOrder = -100000;
        skyMesh.userData.lightflowEnvironment = true;
        skyMesh.userData.lightflowEnvironmentBloomComponent = 'celestial';
        skyMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!skyMaterial || !camera) return;
            updateSkyProjection(skyMaterial, camera);
            camera.getWorldDirection?.(skyMaterial.uniforms.uViewDirection.value);
            camera.getWorldPosition?.(skyMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(skyMesh);
        createVanillaStars();
        createVoxelClouds();
        createLensFlare();
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
        publishWindowBinding('LightflowEnvironmentSunLight', sunLight);
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

    function getShadowFitCorners(preview) {
        if (settings.shadow_scene_fit && !settings.shadow_region_locked) {
            const corners = window.LightManagerShadowRegions?.sceneCorners?.(preview);
            if (corners?.length) return corners;
        }
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

    function updateSunShadowPlacement(celestialDirection, preview) {
        if (!sunLight || !sunTarget) return;
        const direction = new THREE.Vector3().fromArray(celestialDirection);
        if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
        else direction.normalize();

        /*
         * The marked region stays fixed in world space. Only the directional
         * shadow camera moves with the celestial light, so refit its symmetric
         * orthographic bounds and depth range around the same eight corners.
        */
        const fitCorners = settings.shadow_auto_fit ? getShadowFitCorners(preview) : null;
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
        let area = 0, halfWidth = 0, halfHeight = 0;
        let near = Infinity;
        let far = -Infinity;
        fitCorners.forEach(corner => {
            const local = corner.clone().sub(lightPosition).applyQuaternion(inverseViewQuaternion);
            halfWidth = Math.max(halfWidth, Math.abs(local.x));
            halfHeight = Math.max(halfHeight, Math.abs(local.y));
            area = Math.max(halfWidth, halfHeight);
            const depth = -local.z;
            near = Math.min(near, depth);
            far = Math.max(far, depth);
        });

        const lateralPadding = Math.max(0.25, area * 0.015);
        const depthSpan = Math.max(1, far - near);
        const depthPadding = Math.max(0.5, depthSpan * 0.01);
        const squareKernel = !settings.pixelated_shadows && ['distance', 'artistic'].includes(settings.shadow_softness_mode);
        effectiveShadowFrustum = {
            area: Math.max(2, area + lateralPadding),
            halfWidth: squareKernel ? Math.max(2, area + lateralPadding) : Math.max(0.05, halfWidth + Math.max(0.05, halfWidth * 0.015)),
            halfHeight: squareKernel ? Math.max(2, area + lateralPadding) : Math.max(0.05, halfHeight + Math.max(0.05, halfHeight * 0.015)),
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
        const quaternion = getShadowViewQuaternion(position, target);
        const corners = getWorldAlignedShadowCorners(
            buildShadowFrustumWorldCorners(frustum, position, quaternion)
        );
        settings.shadow_fit_corners = corners.flatMap(corner => corner.toArray());
    }

    function isSunShadowActive(state = getCelestialLightingState()) {
        return !!(
            state.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            state.sunIntensity > 0.0001
        );
    }

    function configureSunShadow(force, options = {}) {
        if (!sunLight?.shadow) return false;
        const studioRender = options.studio !== undefined
            ? !!options.studio
            : !!window.LightManagerStudioRenderSession;
        const renderer = options.preview?.renderer || window.Preview?.selected?.renderer || window.main_preview?.renderer;
        let maxTextureSize = Number(renderer?.capabilities?.maxTextureSize) || 0;
        if (maxTextureSize <= 0) {
            maxTextureSize = 4096;
            try {
                const gl = renderer?.getContext?.();
                if (gl) maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || maxTextureSize;
            } catch (error) {
                // Use the conservative fallback for nonstandard renderers.
            }
        }
        const requestedResolution = studioRender && settings.studio_shadow_resolution > 0
            ? settings.studio_shadow_resolution
            : settings.shadow_resolution;
        const resolution = Math.min(requestedResolution, maxTextureSize);
        const frustum = getActiveShadowFrustum();
        const area = frustum.area;
        const shadow = sunLight.shadow;
        const state = options.state || getCelestialLightingState();
        const castsShadow = isSunShadowActive(state);
        sunLight.userData = sunLight.userData || {};
        if (castsShadow) {
            sunLight.userData.lightflowEnvironmentRetainShadowSlot = true;
        }
        const rendererCastsShadow = castsShadow ||
            sunLight.userData.lightflowEnvironmentRetainShadowSlot === true;
        const radius = settings.pixelated_shadows ? 0 : settings.shadow_softness;
        /*
         * Only shadow-map contents belong in this signature. Bias, normal
         * bias and source-size softness are receiver-sampling parameters;
         * changing them must not redraw the cached sun depth map.
         */
        const configSignature = [
            castsShadow ? 1 : 0,
            resolution,
            area, frustum.halfWidth ?? area, frustum.halfHeight ?? area,
            frustum.near,
            frustum.far,
            ...sunLight.position.toArray(),
            ...(sunTarget?.position.toArray() || [0, 0, 0])
        ].map(value => Number(value).toFixed(5)).join('|');
        const configChanged = configSignature !== lastSunShadowConfig;
        const resolutionChanged = shadow.mapSize.width !== resolution || shadow.mapSize.height !== resolution;
        let cameraChanged = false;

        /*
         * Keep Three's directional-shadow slot stable after its first use.
         * The logical shadow state still comes from `castsShadow`; retaining
         * the renderer slot only avoids recompiling every material when the
         * Environment visibility toggle changes.
         */
        if (sunLight.castShadow !== rendererCastsShadow) {
            sunLight.castShadow = rendererCastsShadow;
        }
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
            left: -(frustum.halfWidth ?? area), right: frustum.halfWidth ?? area,
            top: frustum.halfHeight ?? area, bottom: -(frustum.halfHeight ?? area),
            near: frustum.near, far: frustum.far
        };
        Object.entries(cameraValues).forEach(([key, value]) => {
            if (shadow.camera[key] === value) return;
            shadow.camera[key] = value;
            cameraChanged = true;
        });
        const footprint = Math.max(cameraValues.right - cameraValues.left, cameraValues.top - cameraValues.bottom) / resolution;
        const bias = settings.shadow_normal_bias_auto && Math.abs(settings.shadow_bias + 0.00035) < 1e-7
            ? -Math.max(1e-8, Math.min(0.12, Math.max(0.00025, footprint * 0.15)) / (frustum.far - frustum.near)) : settings.shadow_bias;
        if (shadow.bias !== bias) shadow.bias = bias;
        const normalBias = settings.shadow_normal_bias_auto ? clamp(footprint * 0.8, 0.00025, 0.12) : settings.shadow_normal_bias;
        sunLight.userData.lightflowAutoNormalBias = settings.shadow_normal_bias_auto;
        if (shadow.normalBias !== normalBias) shadow.normalBias = normalBias;
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
            shadow.autoUpdate = false;
            shadow.needsUpdate = castsShadow;
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
        if (!settings.shadow_auto_fit && sunLight && sunTarget) {
            const position = sunLight.getWorldPosition(new THREE.Vector3());
            const target = sunTarget.getWorldPosition(new THREE.Vector3());
            return new THREE.Box3().setFromPoints(buildShadowFrustumWorldCorners(getActiveShadowFrustum(), position, getShadowViewQuaternion(position, target)));
        }
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
        const handle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), material);
        handle.name = `lightflow_environment_shadow_${name}`;
        handle.renderOrder = 1003;
        handle.userData.lightflowEnvironmentShadowHandle = { name, axis, sign };
        handle.onBeforeRender = (renderer, _scene, camera) => {
            const gizmos = window.LightManagerUI?.gizmos;
            gizmos?.style?.(handle, axis === 'x' ? 'r' : axis === 'y' ? 'g' : 'b', true);
            const size = gizmos?.screenWorldSize?.(handle, camera, renderer, 5);
            if (size) { handle.scale.setScalar(size); handle.updateWorldMatrix(true, false); }
        };
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
        line.onBeforeRender = () => window.LightManagerUI?.gizmos?.style?.(line, 'outline', window.Toolbox?.selected?.id === 'lightflow_sun_region_tool');
        root.add(line);

        const handles = {
            boundPX: makeSunShadowGizmoHandle(root, 'bound_px', 0x9301fb, 'x', 1),
            boundNX: makeSunShadowGizmoHandle(root, 'bound_nx', 0x9301fb, 'x', -1),
            boundPY: makeSunShadowGizmoHandle(root, 'bound_py', 0x9301fb, 'y', 1),
            boundNY: makeSunShadowGizmoHandle(root, 'bound_ny', 0x9301fb, 'y', -1),
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
            (settings.show_shadow_gizmo || window.Toolbox?.selected?.id === 'lightflow_sun_region_tool') &&
            settings.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            (settings.shadow_auto_fit || window.Toolbox?.selected?.id === 'lightflow_sun_region_tool') &&
            (!window.Canvas || Canvas.show_gizmos !== false) &&
            (window.Toolbox?.selected?.id === 'lightflow_sun_region_tool' || !window.LightManagerAreaGizmos || LightManagerAreaGizmos.enabled !== false)
            && (window.Toolbox?.selected?.id === 'lightflow_sun_region_tool' || window.LightManagerUI?.workspace?.helperPolicy === 'all')
        );
        gizmo.root.visible = shouldShow;
        if (!shouldShow) return;

        const fitBox = getShadowFitBox();
        const center = fitBox.getCenter(new THREE.Vector3());
        const halfSize = fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        gizmo.root.position.copy(center);
        gizmo.root.quaternion.identity();
        gizmo.root.scale.setScalar(1);
        gizmo.root.updateMatrixWorld(true);
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
            handle.visible = window.Toolbox?.selected?.id === 'lightflow_sun_region_tool';
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
        let hoveredHandle = null, hoverStatus = null;
        const clearHover = () => {
            window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle, false);
            hoveredHandle = null;
            if (hoverStatus && window.Prop?.file_name === hoverStatus) Blockbench.setStatusBarText();
            hoverStatus = null;
        };
        const onPointerDown = event => {
            if (event.button !== 0 || !sunShadowGizmo?.root?.visible || window.Canvas?.show_gizmos === false) return;
            const preview = getSunShadowGizmoPreview(event);
            if (!preview?.canvas || event.target !== preview.canvas) return;
            setSunShadowGizmoRay(event, preview);
            const handles = Object.values(sunShadowGizmo.handles).filter(handle => handle.visible !== false);
            const hit = sunShadowGizmoRaycaster.intersectObjects(handles, false)[0];
            const handle = hit?.object?.userData?.lightflowEnvironmentShadowHandle;
            if (!hit || !handle) return;
            clearHover();hoveredHandle=hit.object;window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle,true);
            beginEnvironmentUndo();
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
                    shadow_scene_fit: settings.shadow_scene_fit,
                    shadow_region_locked: settings.shadow_region_locked,
                    shadow_fit_corners: Array.isArray(settings.shadow_fit_corners)
                        ? settings.shadow_fit_corners.slice()
                        : null
                }
            };
            stopSunShadowGizmoEvent(event);
        };
        const onPointerMove = event => {
            if (!sunShadowGizmoDrag) {
                clearHover();
                if (!sunShadowGizmo?.root?.visible || window.Canvas?.show_gizmos === false) return;
                const preview = getSunShadowGizmoPreview(event);
                if (!preview?.canvas || event.target !== preview.canvas) return;
                setSunShadowGizmoRay(event, preview);
                const handles = Object.values(sunShadowGizmo.handles).filter(handle => handle.visible);
                hoveredHandle = sunShadowGizmoRaycaster.intersectObjects(handles, false)[0]?.object || null;
                if (hoveredHandle) {
                    window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle, true);
                    hoverStatus = tl('light_manager.ui.sun_region') + ' · ' + hoveredHandle.userData.lightflowEnvironmentShadowHandle.axis.toUpperCase();
                    Blockbench.setStatusBarText(hoverStatus);
                }
                return;
            }
            stopSunShadowGizmoEvent(event);
            updateSunShadowGizmoDrag(event);
        };
        const onPointerUp = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            sunShadowGizmoDrag = null;
            finishEnvironmentUndo();
            clearHover();
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
            cancelEnvironmentUndo(false);
            clearHover();
        };
        const cancelPointer = () => {
            clearHover();
            if (!sunShadowGizmoDrag) return;
            const original = sunShadowGizmoDrag.original;
            sunShadowGizmoDrag = null;
            applySettings(original, {cause: 'shadow_gizmo_cancel', captureShadowFitRegion: false});
            cancelEnvironmentUndo(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointercancel', cancelPointer, true);
        window.addEventListener('blur', cancelPointer);
        sunShadowGizmoListeners.push(
            clearHover,
            () => document.removeEventListener('pointerdown', onPointerDown, true),
            () => document.removeEventListener('pointermove', onPointerMove, true),
            () => document.removeEventListener('pointerup', onPointerUp, true),
            () => document.removeEventListener('keydown', onKeyDown, true),
            () => document.removeEventListener('pointercancel', cancelPointer, true),
            () => window.removeEventListener('blur', cancelPointer)
        );
        const regionTool = new Tool('lightflow_sun_region_tool', {
            name: 'light_manager.ui.sun_region', icon: 'crop_free', modes: ['edit', 'render'], selectElements: false,
            condition: () => !!window.Project && !!(Modes.edit || Modes.render) && settings.enabled && settings.sun_enabled && settings.sun_cast_shadows && settings.shadow_auto_fit,
            onSelect: updateSunShadowGizmo,
            onUnselect() { cancelPointer(); updateSunShadowGizmo(); }
        });
        deletables.push(regionTool);
        window.LightManagerUI?.removeToolbarAction?.(regionTool);
    }

    function setColor(target, value) {
        target?.setRGB?.(value[0], value[1], value[2]);
    }

    function updateScene(options = {}) {
        // A late texture-load callback can arrive after plugin unload. It must
        // not recreate disposed sky meshes alongside the next plugin instance.
        if (!environmentRuntimeLoaded || !window.THREE || !window.Canvas?.scene) return;
        if (settings.enabled && typeof PreviewScene !== 'undefined') PreviewScene.active?.unselect?.();
        const studioRender = options.studio !== undefined
            ? !!options.studio
            : !!window.LightManagerStudioRenderSession;
        createSky();
        createSunLight();
        ensureSunLightParent();
        ensureSkyTextures();
        const state = getLightingState();
        const preset = getPalette();

        if (skyMesh) skyMesh.visible = !!settings.enabled;
        if (lensFlareMesh) lensFlareMesh.visible = !!(settings.enabled && settings.lens_flare_enabled && state.celestialEnabled && settings.sun_mode !== 'hidden');
        if (cloudMesh) cloudMesh.visible = !!(settings.enabled && state.celestialEnabled && settings.clouds_enabled);
        updateVanillaStars(state);
        if (skyMaterial) {
            updateSkyGradientTexture(state);
            skyMaterial.uniforms.uSkyGradient.value = skyGradientTexture;
            skyMaterial.uniforms.uSkyIntensity.value = settings.sky_intensity;
            setColor(skyMaterial.uniforms.uZenith.value, state.zenithColor);
            setColor(skyMaterial.uniforms.uHorizon.value, state.horizonColor);
            setColor(skyMaterial.uniforms.uGround.value, state.groundColor);
            skyMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
            setColor(skyMaterial.uniforms.uSunColor.value, hexToRgb(preset.sun));
            const vibrantSunset = state.referenceCelestials && settings.preset === 'vibrant_visuals';
            setColor(skyMaterial.uniforms.uSunGlareColor.value, vibrantSunset
                ? mixColor(hexToRgb(preset.sun),hexToRgb('#ff8c26'),state.twilight) : hexToRgb(preset.sun));
            setColor(skyMaterial.uniforms.uMoonColor.value, hexToRgb(preset.moon));
            setColor(skyMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
            setColor(skyMaterial.uniforms.uSunsetColor.value, state.referenceCelestials ? state.horizonColor : hexToRgb(preset.sunrise_horizon));
            skyMaterial.uniforms.uReferenceCycle.value = state.referenceCelestials ? 1 : 0;
            skyMaterial.uniforms.uEndAtmosphere.value = settings.dimension === 'end' ? 1 : 0;
            skyMaterial.uniforms.uEndSkyTexture.value = endSkyTexture || missingSkyTexture || fallbackTexture;
            skyMaterial.uniforms.uDaylight.value = state.daylight;
            skyMaterial.uniforms.uNight.value = state.night;
            skyMaterial.uniforms.uTwilight.value = state.twilight;
            skyMaterial.uniforms.uCelestialSize.value = settings.celestial_size;
            skyMaterial.uniforms.uMoonSize.value = settings.moon_size;
            skyMaterial.uniforms.uMoonPhase.value = settings.moon_phase;
            skyMaterial.uniforms.uMoonPhaseOffset.value = settings.moon_mode === 'texture' ? settings.moon_phase_offset : 0;
            skyMaterial.uniforms.uStars.value = settings.stars_enabled ? settings.star_brightness : 0;
            skyMaterial.uniforms.uCloudCoverage.value = state.cloudCoverage;
            skyMaterial.uniforms.uCloudOpacity.value = state.cloudOpacity;
            skyMaterial.uniforms.uCloudTime.value = getCloudMotionTime();
            skyMaterial.uniforms.uVibrant.value = settings.preset === 'vibrant_visuals' ? 1 : 0;
            skyMaterial.uniforms.uVibrantCelestialCalibration.value = settings.preset === 'vibrant_visuals' && settings.palette_mode === 'preset';
            skyMaterial.uniforms.uSkyGradientPower.value = state.skyGradientPower;
            skyMaterial.uniforms.uStarDensity.value = settings.star_density;
            skyMaterial.uniforms.uSunHorizonScale.value = settings.sun_horizon_scale;
            skyMaterial.uniforms.uSunGazeScale.value = settings.sun_gaze_scale;
            skyMaterial.uniforms.uSunGlare.value = settings.sun_glare;
            skyMaterial.uniforms.uSunsetDirectionalGlow.value = settings.sunset_directional_glow;

            const customSunTexture = getBlockbenchTextureMap(settings.sun_texture_uuid, 'sun');
            const customMoonTexture = getBlockbenchTextureMap(settings.moon_texture_uuid, 'moon');
            const customCloudTexture = getBlockbenchTextureMap(settings.cloud_texture_uuid, 'cloud');
            const presetSunTexture = settings.preset === 'vibrant_visuals'
                ? (vibrantVisualsSunTexture || vanillaSunTexture)
                : vanillaSunTexture;
            const selectedSunTexture = settings.sun_mode === 'texture' && customSunTexture
                ? customSunTexture
                : presetSunTexture;
            const selectedMoonTexture = settings.moon_mode === 'texture' && customMoonTexture
                ? customMoonTexture
                : vanillaMoonPhasesTexture;
            const customMoonUsesAtlas = settings.moon_mode !== 'texture' || settings.moon_texture_layout === 'atlas';

            skyMaterial.uniforms.uSunMode.value = settings.sun_mode === 'hidden' || !state.celestialEnabled ? 0 : 1;
            skyMaterial.uniforms.uMoonMode.value = settings.moon_mode === 'hidden' || !state.celestialEnabled
                ? 0
                : (customMoonUsesAtlas ? 1 : 2);
            const celestialBlendModes = { preset: 0, alpha: 1, additive: 2, multiply: 3 };
            skyMaterial.uniforms.uSunBlendMode.value = celestialBlendModes[settings.sun_blend_mode] ?? 0;
            skyMaterial.uniforms.uMoonBlendMode.value = celestialBlendModes[settings.moon_blend_mode] ?? 0;
            skyMaterial.uniforms.uSunOpacity.value = settings.sun_opacity;
            skyMaterial.uniforms.uMoonOpacity.value = settings.moon_opacity;
            skyMaterial.uniforms.uMoonAtlasGrid.value.set(
                settings.moon_mode === 'texture' ? settings.moon_atlas_columns : 4,
                settings.moon_mode === 'texture' ? settings.moon_atlas_rows : 2
            );
            skyMaterial.uniforms.uSunTexture.value = selectedSunTexture || missingSkyTexture || fallbackTexture;
            skyMaterial.uniforms.uMoonTexture.value = selectedMoonTexture || missingSkyTexture || fallbackTexture;
            if (starMaterial) {
                starMaterial.uniforms.uMoonTexture.value = skyMaterial.uniforms.uMoonTexture.value;
                starMaterial.uniforms.uMoonMode.value = skyMaterial.uniforms.uMoonMode.value;
                starMaterial.uniforms.uMoonFrame.value = settings.moon_phase + skyMaterial.uniforms.uMoonPhaseOffset.value;
                starMaterial.uniforms.uMoonAtlasGrid.value.copy(skyMaterial.uniforms.uMoonAtlasGrid.value);
            }
            const activeCloudTexture = settings.cloud_mode === 'procedural'
                ? (proceduralCloudTexture || fallbackTexture)
                : settings.cloud_mode === 'texture' && customCloudTexture
                    ? customCloudTexture
                    : (vanillaCloudTexture || missingSkyTexture || fallbackTexture);
            const cachedProceduralSource = settings.cloud_mode === 'procedural' && !!proceduralCloudTexture;
            const cloudTextureMode = settings.cloud_mode === 'procedural' && !cachedProceduralSource ? 0 : 1;
            skyMaterial.uniforms.uCloudMode.value = cloudTextureMode;
            skyMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
            if (cloudMaterial) {
                setColor(cloudMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
                setColor(cloudMaterial.uniforms.uCloudTopColor.value, state.cloudTopColor);
                setColor(cloudMaterial.uniforms.uCloudPhaseTop.value, state.cloudPhaseTop);
                setColor(cloudMaterial.uniforms.uCloudPhaseBottom.value, state.cloudPhaseBottom);
                cloudMaterial.uniforms.uReferenceCycle.value = state.referenceCloudCycle ? 1 : 0;
                setColor(cloudMaterial.uniforms.uCloudSunSideColor.value, state.cloudSunSideColor);
                setColor(cloudMaterial.uniforms.uCloudShadowSideColor.value, state.cloudShadowSideColor);
                setColor(cloudMaterial.uniforms.uCloudBottomColor.value, state.cloudBottomColor);
                setColor(cloudMaterial.uniforms.uCloudEdgeColor.value, state.cloudEdgeColor);
                setColor(cloudMaterial.uniforms.uCloudShadowBevelColor.value, state.cloudShadowBevelColor);
                setColor(cloudMaterial.uniforms.uCloudFogColor.value, state.cloudFogColor);
                setColor(cloudMaterial.uniforms.uSunsetColor.value, hexToRgb(preset.sunrise_horizon));
                setColor(cloudMaterial.uniforms.uSunColor.value, state.sunLightColor);
                cloudMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
                cloudMaterial.uniforms.uDaylight.value = state.daylight;
                cloudMaterial.uniforms.uNight.value = state.night;
                cloudMaterial.uniforms.uTwilight.value = state.twilight;
                cloudMaterial.uniforms.uSkyIntensity.value = settings.sky_intensity;
                cloudMaterial.uniforms.uSkyGradientPower.value = state.skyGradientPower;
                cloudMaterial.uniforms.uSkyGradient.value = skyGradientTexture || fallbackTexture;
                cloudMaterial.uniforms.uCloudCoverage.value = state.cloudCoverage;
                cloudMaterial.uniforms.uCloudOpacity.value = state.cloudOpacity;
                cloudMaterial.uniforms.uCloudTime.value = updateCloudDerivedUniforms();
                cloudMaterial.uniforms.uCloudMode.value = cloudTextureMode;
                cloudMaterial.uniforms.uCloudStyle.value = settings.cloud_style === 'vibrant_visuals' ? 2 : (settings.cloud_style === 'rendercraft' ? 1 : 0);
                cloudMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
                const cloudTextureSize = getTextureSize(activeCloudTexture);
                cloudMaterial.uniforms.uCloudTextureSize.value.set(cloudTextureSize[0], cloudTextureSize[1]);
                const occupancy = cloudTextureMode === 1
                    ? getCloudOccupancyTexture(activeCloudTexture)
                    : null;
                cloudMaterial.uniforms.uCloudOccupancyTexture.value = occupancy?.texture || fallbackTexture;
                cloudMaterial.uniforms.uCloudOccupancySize.value.set(
                    occupancy?.width || 1,
                    occupancy?.height || 1
                );
                cloudMaterial.uniforms.uCloudHierarchyEnabled.value = occupancy?.conservative ? 1 : 0;
                // The selected cloud material is independent of its sky preset or user copy.
                const vibrantCloudModel = settings.cloud_style === 'vibrant_visuals';
                cloudMaterial.uniforms.uCloudBevelEnabled.value = settings.cloud_bevel_enabled;
                cloudMaterial.uniforms.uCloudScatteringStrength.value = state.cloudScatteringStrength;
                cloudMaterial.uniforms.uCloudScatteringSize.value = state.cloudScatteringSize;
                cloudMaterial.uniforms.uCloudEdgeHardness.value = state.cloudEdgeHardness;
                cloudMaterial.uniforms.uCloudViewResponse.value = state.cloudViewResponse;
                cloudMaterial.uniforms.uCloudGradientThickness.value = state.cloudGradientThickness;
                cloudMaterial.uniforms.uCloudGradientAlpha.value = state.cloudGradientAlpha;
                cloudMaterial.uniforms.uCloudOpticalThickness.value = state.cloudOpticalThickness;
                cloudMaterial.uniforms.uCloudPhaseAnisotropy.value = state.cloudPhaseAnisotropy;
                cloudMaterial.uniforms.uCloudDensityVariation.value = state.cloudDensityVariation;
                cloudMaterial.uniforms.uVibrantCloudModel.value = vibrantCloudModel;
                const distanceField = vibrantCloudModel && cloudTextureMode === 1
                    ? getCloudDistanceTexture(activeCloudTexture, state.cloudCoverage, state.cloudContrast) : null;
                cloudMaterial.uniforms.uCloudDistanceEnabled.value = !!distanceField;
                cloudMaterial.uniforms.uCloudDistanceTexture.value = distanceField?.texture || fallbackTexture;
                cloudMaterial.uniforms.uCloudKeyDirection.value.fromArray(state.celestialDirection);
                const nativeSun = settings.palette_mode === 'preset' && settings.sun_light_color_mode === DEFAULT_SETTINGS.sun_light_color_mode && state.sunDirection[1] >= -.04;
                const cloudKeyColor = nativeSun && vibrantCloudModel && settings.preset === 'vibrant_visuals'
                    ? mixColor(hexToRgb('#fff7f0'),hexToRgb('#ffb16c'),1-smoothstep(.04,.50,state.sunDirection[1])) : state.sunColor;
                setColor(cloudMaterial.uniforms.uCloudKeyColor.value,cloudKeyColor);
                cloudMaterial.uniforms.uCloudKeyEnergy.value = state.sunIntensity * (state.sunDirection[1] < -.04 ? .147 : .42);
                cloudMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
                cloudMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
                cloudMaterial.uniforms.uCloudContrast.value = state.cloudContrast;
                cloudMaterial.uniforms.uCloudBrightness.value = state.cloudBrightness;
                cloudMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
                cloudMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
                cloudMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
                cloudMaterial.uniforms.uCloudBevelWidth.value = state.cloudBevelWidth;
                cloudMaterial.uniforms.uCloudBevelSoftness.value = state.cloudBevelSoftness;
                cloudMaterial.uniforms.uCloudBevelRoundness.value = state.cloudBevelRoundness;
                cloudMaterial.uniforms.uCloudBevelStrength.value = state.cloudBevelStrength;
                cloudMaterial.uniforms.uCloudBevelSmooth.value = settings.cloud_bevel_smooth ? 1 : 0;
                cloudMaterial.uniforms.uCloudBevelDistanceFade.value = settings.cloud_bevel_distance_fade ? 1 : 0;
                cloudMaterial.uniforms.uCloudBevelDistanceMinScale.value = state.cloudBevelDistanceMinScale;
                cloudMaterial.uniforms.uCloudEdgeStrength.value = state.cloudEdgeStrength;
                cloudMaterial.uniforms.uCloudShadowBevelStrength.value = state.cloudShadowBevelStrength;
                cloudMaterial.uniforms.uCloudLightingMode.value = settings.cloud_lighting_mode === 'sky' ? 1 : (settings.cloud_lighting_mode === 'mixed' ? 2 : 0);
                cloudMaterial.uniforms.uCloudSkyTintStrength.value = state.cloudSkyTintStrength;
                cloudMaterial.uniforms.uCloudEnvironmentInfluence.value = state.cloudEnvironmentInfluence;
                cloudMaterial.uniforms.uCloudTimeTintStrength.value = state.cloudTimeTintStrength;
                cloudMaterial.uniforms.uCloudUsePalette.value = state.cloudUsePalette;
                cloudMaterial.uniforms.uCloudSunTintStrength.value = state.cloudSunTintStrength;
                cloudMaterial.uniforms.uCloudFogEnabled.value = settings.cloud_fog_enabled ? 1 : 0;
                cloudMaterial.uniforms.uCloudFogColorMode.value = settings.cloud_fog_color_mode === 'custom' ? 1 : 0;
                cloudMaterial.uniforms.uCloudFogStrength.value = state.cloudFogStrength;
                cloudMaterial.uniforms.uCloudFogStart.value = state.cloudFogStart;
                cloudMaterial.uniforms.uCloudFogEnd.value = state.cloudFogEnd;
                cloudMaterial.uniforms.uCloudDensity.value = state.cloudDensity;
                cloudMaterial.uniforms.uCloudAbsorption.value = state.cloudAbsorption;
                cloudMaterial.uniforms.uCloudTranslucency.value = state.cloudTranslucency;
                cloudMaterial.uniforms.uCloudBloomContribution.value = state.cloudBloomContribution;
            }
            skyMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
            skyMaterial.uniforms.uSunBloomContribution.value = settings.sun_bloom_contribution;
            skyMaterial.uniforms.uMoonBloomContribution.value = settings.moon_bloom_contribution;
            skyMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
            skyMaterial.uniforms.uCloudContrast.value = state.cloudContrast;
            skyMaterial.uniforms.uCloudBrightness.value = state.cloudBrightness;
            skyMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
            skyMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
            skyMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
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
                studio: studioRender,
                preview: options.preview,
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
            // The animated sun changes only its own shadow image. Redrawing
            // every point-light atlas here makes a day cycle as expensive as
            // animating every scene light. Explicit scene repairs stay global.
            window.LightManagerMarkShadowsDirty(options.forceShadow
                ? { scene: true }
                : { elements: [sunLight] });
        }
        if (
            shadowChanged &&
            options.deferRenderPreparation !== true &&
            typeof window.LightManagerPrepareRender === 'function'
        ) {
            const preview = options.preview || window.Preview?.selected || window.main_preview || window.MediaPreview || null;
            window.LightManagerPrepareRender(preview, {
                force: !!options.forceShadow,
                studio: studioRender
            });
        }
        syncDistanceFog(options.preview);
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (typeof window.LightflowRequestPreviewRender === 'function') {
            window.LightflowRequestPreviewRender({ cause: 'environment_update' });
            return;
        }
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
        if (environmentPanelFormDirty && !environmentPanel.node?.getClientRects?.().length) return;
        const controls = environmentPanel.form.form_data;
        if (!controls) return;
        syncingEnvironmentPanel = true;
        let refreshLayout = true;
        try {
            const requestedKeys = Array.isArray(options.changedKeys)
                ? options.changedKeys.slice()
                : null;
            if (options.timeOnly) {
                controls.time?.setValue?.(settings.time);
                return;
            }
            const activeShadowFrustum = getActiveShadowFrustum();
            const panelValues = Object.assign({}, settings, {
                shadow_area: activeShadowFrustum.area,
                shadow_near: activeShadowFrustum.near,
                shadow_far: activeShadowFrustum.far
            });
            const keys = requestedKeys !== null
                ? requestedKeys.filter(key => Object.prototype.hasOwnProperty.call(panelValues, key))
                : Object.keys(DEFAULT_SETTINGS);
            refreshLayout = requestedKeys === null || keys.some(key => environmentPanelLayoutKeys.has(key));
            keys.forEach(key => {
                controls[key]?.setValue?.(panelValues[key]);
            });
        } finally {
            syncingEnvironmentPanel = false;
        }
        if (refreshLayout) environmentPanel.form.update();
    }

    function rebuildEnvironmentPanelForm() {
        if (!environmentPanel?.form) return;
        environmentPanelFormDirty = true;
        // Build current project controls when the native tab becomes visible.
        if (!environmentPanel.node?.getClientRects?.().length) return;
        environmentPanelFormDirty = false;
        const scrollContainer = environmentPanel.node?.querySelector?.('.form');
        const scrollTop = scrollContainer?.scrollTop || 0;
        environmentPanel.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(createPanelForm());
        environmentPanel.form.buildForm();
        syncEnvironmentPanel();
        const nextScrollContainer = environmentPanel.node?.querySelector?.('.form');
        if (nextScrollContainer) nextScrollContainer.scrollTop = scrollTop;
    }

    function applySettings(next, options = {}) {
        const performanceNow = () => typeof performance !== 'undefined'
            ? performance.now()
            : Date.now();
        const performanceStartedAt = performanceNow();
        let performanceCheckpoint = performanceStartedAt;
        const performancePhases = {};
        const recordPhase = name => {
            const now = performanceNow();
            performancePhases[name] = Math.max(0, now - performanceCheckpoint);
            performanceCheckpoint = now;
        };
        const previousState = settings;
        const previousSettings = JSON.stringify(settings);
        const incoming = Object.assign({}, next || {});
        // Full dialogs can return tinycolor objects and numeric strings. Compare
        // their normalized values so a quick edit does not clone an unchanged sky.
        const comparable = normalizeSettings(Object.assign({}, settings, incoming));
        const editedKeys = Object.keys(incoming).filter(key => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) &&
            JSON.stringify(comparable[key]) !== JSON.stringify(settings[key]));
        if (incoming.palette_mode === 'custom' && settings.palette_mode !== 'custom') {
            seedCustomSkyPalette(incoming);
        }
        if (!applyingSkyPreset && editedKeys.includes('shadow_normal_bias') && !Object.prototype.hasOwnProperty.call(incoming, 'shadow_normal_bias_auto')) incoming.shadow_normal_bias_auto = false;
        const rebaseCloudMotion = !applyingSkyPreset && editedKeys.some(key => key === 'cloud_paused' || key === 'cloud_speed');
        const previousCloudMotion = rebaseCloudMotion ? getCloudMotionTime() : 0;
        let createdCopy = false;
        if (isNativeSkyPresetSelected() && !applyingSkyPreset &&
            !['animation', 'project_load', 'undo', 'dialog_cancel', 'gradient_dialog_cancel'].includes(options.cause) &&
            editedKeys.some(key => !NATIVE_QUICK_SETTINGS.has(key))) {
            // Clone the current look before the first advanced edit, inside the
            // existing edit's undo transaction. Do not rebuild focused controls.
            const source = getSkyPreset();
            const copy = createCustomSkyPreset({ name: source.name + ' Custom', basePresetId: source.id,
                settings: captureEnvironmentPresetSettings() }, { select: false, refreshPanel: false });
            if (copy) { activeSkyPresetId = copy.id; createdCopy = true; }
        }
        const lockCorners = incoming.shadow_region_locked === true && !settings.shadow_region_locked
            ? getShadowFitCorners().flatMap(corner => corner.toArray()) : null;
        const frustumKeys = ['shadow_area', 'shadow_near', 'shadow_far'];
        const hasFrustumEdit = frustumKeys.some(key => Object.prototype.hasOwnProperty.call(incoming, key));
        const shouldCaptureFitRegion = hasFrustumEdit && !applyingSkyPreset && (
            options.captureShadowFitRegion === true ||
            (
                options.captureShadowFitRegion !== false &&
                frustumKeys.some(key => editedKeys.includes(key)) &&
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
        if (lockCorners) merged.shadow_fit_corners = lockCorners;
        if (Array.isArray(incoming.shadow_fit_corners) && !Object.prototype.hasOwnProperty.call(incoming, 'shadow_scene_fit')) {
            merged.shadow_scene_fit = false;
            merged.shadow_region_locked = true;
        }
        if (
            Object.prototype.hasOwnProperty.call(incoming, 'shadow_softness') &&
            !Object.prototype.hasOwnProperty.call(incoming, 'shadow_softness_mode') &&
            settings.shadow_softness_mode === 'legacy' &&
            Number(incoming.shadow_softness) !== Number(settings.shadow_softness)
        ) {
            merged.shadow_softness_mode = 'distance';
        }
        if (shouldCaptureFitRegion) {
            merged.shadow_scene_fit = false;
            merged.shadow_region_locked = true;
            merged.shadow_area = manualFrustum.area;
            merged.shadow_near = manualFrustum.near;
            merged.shadow_far = manualFrustum.far;
        }
        settings = normalizeSettings(merged);
        if (rebaseCloudMotion) {
            // Pause at the current field, and resume/change speed without jumping
            // to a new position on the absolute viewport/cinematic clock.
            settings.cloud_motion_phase += previousCloudMotion - getCloudMotionTime();
        }
        // Dialogs submit a complete form; panels submit changed fields. Compare
        // normalized values so fog-only edits use the same path in both UIs.
        const changedKeys = Object.keys(settings).filter(key => settings[key] !== previousState[key] &&
            JSON.stringify(settings[key]) !== JSON.stringify(previousState[key]));
        const fogOnly = changedKeys.length > 0 && changedKeys.every(key =>
            key.startsWith('distance_fog_') || key.startsWith('distance_grade_'));
        recordPhase('normalize');
        if (previousSettings !== JSON.stringify(settings)) markEnvironmentUndoChanged();
        if (shouldCaptureFitRegion) captureShadowFitRegion(manualFrustum);
        saveSettings();
        if (isNativeSkyPresetSelected() && !applyingSkyPreset && options.cause !== 'animation') {
            const overrides = nativeQuickOverrides[activeSkyPresetId] ||= {};
            editedKeys.filter(key => NATIVE_QUICK_SETTINGS.has(key)).forEach(key => {
                overrides[key] = cloneEnvironmentData(settings[key]);
            });
            if (lockCorners) overrides.shadow_fit_corners = lockCorners;
            if (rebaseCloudMotion) overrides.cloud_motion_phase = settings.cloud_motion_phase;
            saveEnvironmentPresetRegistry();
        }
        if (createdCopy) {
            markEnvironmentUndoChanged();
            saveEnvironmentPresetRegistry();
            environmentPanel?.form?.form_data?._environment_preset_identity?.setValue?.(createEnvironmentSkyPresetInfoDisplay().value);
            Blockbench.showQuickMessage(tl('lightflow_environment.message.editable_copy_created'), 2600);
        }
        recordPhase('persist');
        syncActiveCustomSkyPresetFromSettings(options.cause || 'settings');
        recordPhase('preset');
        if (options.syncPanel !== false) syncEnvironmentPanel({ changedKeys });
        recordPhase('panel');
        if (fogOnly && options.forceShadow !== true) syncDistanceFog();
        else updateScene({
            forceShadow: options.forceShadow === true,
            animation: !!options.animation
        });
        recordPhase(fogOnly ? 'fog' : 'scene');
        dispatchChanged(options.cause || 'settings');
        recordPhase('dispatch');
        if (options.render !== false) requestPreviewRender();
        recordPhase('scheduleRender');
        const totalMs = Math.max(0, performanceNow() - performanceStartedAt);
        settingsPerformance.calls += 1;
        if (fogOnly) settingsPerformance.fogOnlyCalls += 1;
        settingsPerformance.maxTotalMs = Math.max(settingsPerformance.maxTotalMs, totalMs);
        settingsPerformance.last = {
            cause: options.cause || 'settings',
            fogOnly,
            changedKeys: changedKeys.slice(),
            totalMs,
            phases: performancePhases
        };
        return Object.assign({}, settings);
    }

    // Authored appearance from the matching presets/*.lfenv exports. Session,
    // project textures, fog/grading and shadow fitting remain outside this profile.
    const AUTHORED_NATIVE_SKY_SETTINGS = Object.freeze({
        rendercraft: {
            palette_mode: "custom",
            sky_custom_palette_saved: true,
            sky_custom_reference_match: false,
            sky_cycle_mode: "reference",
            zenith_color: "#41b6f8",
            horizon_color: "#e4f8ea",
            sunrise_zenith_color: "#5473a5",
            sunrise_horizon_color: "#d1b5aa",
            night_zenith_color: "#040f22",
            night_horizon_color: "#3a72ae",
            ground_color: "#c4dcd7",
            sun_color: "#fff7c7",
            moon_color: "#dce9ff",
            cloud_color: "#edf8ff",
            sky_intensity: 1,
            sky_gradient_power: 1,
            sky_time_gradients_enabled: true,
            sky_time_gradients: [
                {"id": "clock_10000_4", "time": 1500, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "clock_10000_ground", "position": 0, "color": "#ffd196", "midpoint": 0.5}, {"id": "clock_10000_horizon", "position": 0.5, "color": "#ffd196", "midpoint": 0.5042253950951805}, {"id": "clock_10000_zenith", "position": 1, "color": "#2773b4", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "clock_2000_7", "time": 2500, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "clock_2000_ground", "position": 0, "color": "#afeeff", "midpoint": 0.5}, {"id": "clock_2000_horizon", "position": 0.5, "color": "#afeeff", "midpoint": 0.5}, {"id": "clock_2000_zenith", "position": 1, "color": "#049eff", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_day", "phase": "day", "time": 6000, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "day_ground", "position": 0, "color": "#afeeff", "midpoint": 0.5}, {"id": "day_horizon", "position": 0.5, "color": "#afeeff", "midpoint": 0.5}, {"id": "day_zenith", "position": 1, "color": "#049eff", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "clock_10000_6", "time": 10000, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "clock_10000_ground", "position": 0, "color": "#afeeff", "midpoint": 0.5}, {"id": "clock_10000_horizon", "position": 0.5, "color": "#afeeff", "midpoint": 0.5}, {"id": "clock_10000_zenith", "position": 1, "color": "#049eff", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "clock_11000_5", "time": 11800, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "clock_11000_ground", "position": 0, "color": "#ffee96", "midpoint": 0.5}, {"id": "clock_11000_horizon", "position": 0.5, "color": "#ffee96", "midpoint": 0.5}, {"id": "clock_11000_middle", "position": 0.74, "color": "#fe782f", "midpoint": 0.5}, {"id": "clock_11000_zenith", "position": 1, "color": "#ff6d4a", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_sunset", "phase": "sunset", "time": 12500, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunset_ground", "position": 0, "color": "#4f4061", "midpoint": 0.5}, {"id": "sunset_horizon", "position": 0.5, "color": "#a06879", "midpoint": 0.5}, {"id": "sunset_middle", "position": 0.74, "color": "#4d3571", "midpoint": 0.5}, {"id": "sunset_zenith", "position": 1, "color": "#151140", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_night", "phase": "night", "time": 18000, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "night_ground", "position": 0, "color": "#0b1828", "midpoint": 0.5}, {"id": "night_horizon", "position": 0.5, "color": "#3a72ae", "midpoint": 0.5}, {"id": "night_middle", "position": 0.74, "color": "#1d2356", "midpoint": 0.5}, {"id": "night_zenith", "position": 1, "color": "#0d1223", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_sunrise", "phase": "sunrise", "time": 23500, "gradient": {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunrise_ground", "position": 0, "color": "#f8d679", "midpoint": 0.5}, {"id": "sunrise_horizon", "position": 0.5, "color": "#f8d679", "midpoint": 0.5}, {"id": "sunrise_middle", "position": 0.74, "color": "#9690c1", "midpoint": 0.5}, {"id": "sunrise_zenith", "position": 1, "color": "#545ec3", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
            ],
            day_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "day_ground", "position": 0, "color": "#c4dcd7", "midpoint": 0.5}, {"id": "day_horizon", "position": 0.5, "color": "#e4f8ea", "midpoint": 0.5}, {"id": "day_middle", "position": 0.74, "color": "#77cef5", "midpoint": 0.5}, {"id": "day_zenith", "position": 1, "color": "#41b6f8", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunrise_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunrise_ground", "position": 0, "color": "#7c687b", "midpoint": 0.5}, {"id": "sunrise_horizon", "position": 0.5, "color": "#d1b5aa", "midpoint": 0.5}, {"id": "sunrise_middle", "position": 0.74, "color": "#9690c1", "midpoint": 0.5}, {"id": "sunrise_zenith", "position": 1, "color": "#5473a5", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunset_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunset_ground", "position": 0, "color": "#4f4061", "midpoint": 0.5}, {"id": "sunset_horizon", "position": 0.5, "color": "#a06879", "midpoint": 0.5}, {"id": "sunset_middle", "position": 0.74, "color": "#4d3571", "midpoint": 0.5}, {"id": "sunset_zenith", "position": 1, "color": "#151140", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            night_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "night_ground", "position": 0, "color": "#0b1828", "midpoint": 0.5}, {"id": "night_horizon", "position": 0.5, "color": "#3a72ae", "midpoint": 0.5}, {"id": "night_middle", "position": 0.74, "color": "#22416f", "midpoint": 0.5}, {"id": "night_zenith", "position": 1, "color": "#040f22", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            star_density: 1,
            environment_strength: 0.74,
            ambient_fill_color_mode: "sky",
            ambient_fill_shape: "preset",
            ambient_fill_sky_color: "#ffffff",
            ambient_fill_ground_color: "#ffffff",
            ambient_fill_day_multiplier: 1,
            ambient_fill_night_multiplier: 1,
            sun_enabled: true,
            sun_intensity: 2.45,
            sun_light_color_mode: "time",
            sun_light_day_color: "#fff7c7",
            sun_light_twilight_color: "#ffad74",
            moon_intensity: 0.28,
            moon_light_color_mode: "moon",
            moon_light_custom_color: "#a9c8ff",
            celestial_size: 0.25,
            moon_size: 0.25,
            moon_phase: 0,
            sun_mode: "vanilla",
            moon_mode: "vanilla",
            sun_blend_mode: "additive",
            sun_opacity: 1,
            moon_blend_mode: "preset",
            moon_opacity: 1,
            moon_texture_layout: "atlas",
            moon_atlas_columns: 4,
            moon_atlas_rows: 2,
            moon_phase_offset: 0,
            sun_horizon_scale: 2.5,
            sun_gaze_scale: 1,
            sun_glare: 0.75,
            environment_bloom_enabled: true,
            bloom_threshold: 0.78,
            bloom_soft_knee: 0.48,
            bloom_strength: 0.84,
            bloom_core_strength: 0.82,
            bloom_core_radius: 1.15,
            bloom_halo_strength: 0.26,
            bloom_halo_radius: 10.5,
            bloom_hdr_strength: 0.7,
            bloom_emissive_strength: 1.25,
            bloom_occlusion: 0.95,
            sun_bloom_contribution: 0.25,
            moon_bloom_contribution: 0.92,
            star_bloom_contribution: 0.38,
            cloud_bloom_contribution: 0.2,
            stars_enabled: true,
            star_brightness: 0.72,
            clouds_enabled: true,
            cloud_mode: "vanilla",
            cloud_style: "rendercraft",
            cloud_palette_mode: "preset",
            cloud_time_profiles_enabled: true,
            cloud_time_profiles: [
                {"id": "cloud_clock_0", "time": 0, "appearance": {"cloud_coverage": 0.44, "cloud_opacity": 0.9, "cloud_contrast": 4, "cloud_brightness": 1.25, "cloud_bevel_width": 0.025, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 2, "cloud_bevel_distance_min_scale": 0.22, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 1.32, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.25, "cloud_sun_tint_strength": 0.3, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.95, "cloud_absorption": 0.025, "cloud_translucency": 0.35, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.2, "cloud_top_color": "#fcfeff", "cloud_sun_side_color": "#e9f4fa", "cloud_shadow_side_color": "#bed2e2", "cloud_bottom_color": "#8fa8bc", "cloud_edge_color": "#fff3c4", "cloud_shadow_bevel_color": "#7f98ad", "cloud_fog_color": "#1aa6f2"}},
                {"id": "cloud_clock_6000", "time": 6000, "appearance": {"cloud_coverage": 0.44, "cloud_opacity": 0.9, "cloud_contrast": 4, "cloud_brightness": 1.85, "cloud_bevel_width": 0.025, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 2, "cloud_bevel_distance_min_scale": 0.22, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 1.32, "cloud_environment_influence": 0.6, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.25, "cloud_sun_tint_strength": 0.3, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.95, "cloud_absorption": 0.1, "cloud_translucency": 0.32, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.06, "cloud_top_color": "#fcfeff", "cloud_sun_side_color": "#e9f4fa", "cloud_shadow_side_color": "#bed2e2", "cloud_bottom_color": "#8fa8bc", "cloud_edge_color": "#fff3c4", "cloud_shadow_bevel_color": "#7f98ad", "cloud_fog_color": "#1aa6f2"}},
                {"id": "cloud_clock_12000", "time": 12000, "appearance": {"cloud_coverage": 0.44, "cloud_opacity": 0.76, "cloud_contrast": 4, "cloud_brightness": 2.65, "cloud_bevel_width": 0.025, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 2, "cloud_bevel_distance_min_scale": 0.22, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 1.32, "cloud_environment_influence": 0.48, "cloud_time_tint_strength": 0.11, "cloud_sky_tint_strength": 0.42, "cloud_sun_tint_strength": 1, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.4, "cloud_absorption": 0.08, "cloud_translucency": 1, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.06, "cloud_top_color": "#fcfeff", "cloud_sun_side_color": "#e9f4fa", "cloud_shadow_side_color": "#bed2e2", "cloud_bottom_color": "#ffe197", "cloud_edge_color": "#fff3c4", "cloud_shadow_bevel_color": "#7f98ad", "cloud_fog_color": "#1aa6f2"}},
                {"id": "cloud_clock_18000", "time": 18000, "appearance": {"cloud_coverage": 0.44, "cloud_opacity": 0.54, "cloud_contrast": 4, "cloud_brightness": 1.75, "cloud_bevel_width": 0.025, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 2, "cloud_bevel_distance_min_scale": 0.22, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 1.32, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.25, "cloud_sun_tint_strength": 0.3, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1.85, "cloud_absorption": 0.025, "cloud_translucency": 0.35, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.2, "cloud_top_color": "#fcfeff", "cloud_sun_side_color": "#e9f4fa", "cloud_shadow_side_color": "#bed2e2", "cloud_bottom_color": "#8fa8bc", "cloud_edge_color": "#fff3c4", "cloud_shadow_bevel_color": "#7f98ad", "cloud_fog_color": "#1aa6f2"}},
                {"id": "cloud_clock_23000", "time": 23000, "appearance": {"cloud_coverage": 0.54, "cloud_opacity": 0.34, "cloud_contrast": 4, "cloud_brightness": 1.85, "cloud_bevel_width": 0.025, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 2, "cloud_bevel_distance_min_scale": 0.22, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 1.32, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 1, "cloud_sun_tint_strength": 0.34, "cloud_fog_strength": 1, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.95, "cloud_absorption": 0, "cloud_translucency": 1, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.2, "cloud_top_color": "#fcfeff", "cloud_sun_side_color": "#e9f4fa", "cloud_shadow_side_color": "#bed2e2", "cloud_bottom_color": "#8fa8bc", "cloud_edge_color": "#fff3c4", "cloud_shadow_bevel_color": "#7f98ad", "cloud_fog_color": "#1aa6f2"}},
            ],
            cloud_coverage: 0.44,
            cloud_opacity: 0.9,
            cloud_speed: 0.01,
            cloud_scale: 0.72,
            cloud_direction: 0,
            cloud_contrast: 4,
            cloud_brightness: 1.25,
            cloud_height: 128,
            cloud_thickness: 5,
            cloud_extrusion: 1,
            cloud_top_color: "#fcfeff",
            cloud_sun_side_color: "#e9f4fa",
            cloud_shadow_side_color: "#bed2e2",
            cloud_bottom_color: "#8fa8bc",
            cloud_edge_color: "#fff3c4",
            cloud_bevel_width: 0.025,
            cloud_bevel_softness: 0,
            cloud_bevel_roundness: 0,
            cloud_bevel_strength: 2,
            cloud_bevel_enabled: true,
            cloud_bevel_smooth: true,
            cloud_scattering_strength: 1,
            cloud_scattering_size: 1,
            cloud_edge_hardness: 0,
            cloud_view_response: 0,
            cloud_gradient_thickness: 1,
            cloud_gradient_alpha: 0,
            cloud_optical_thickness: 1,
            cloud_phase_anisotropy: 0.46,
            cloud_density_variation: 0.03,
            cloud_bevel_distance_fade: true,
            cloud_bevel_distance_min_scale: 0.22,
            cloud_edge_strength: 2,
            cloud_shadow_bevel_color: "#7f98ad",
            cloud_shadow_bevel_strength: 1.32,
            cloud_lighting_mode: "mixed",
            cloud_environment_influence: 1,
            cloud_time_tint_strength: 1,
            cloud_sky_tint_strength: 0.25,
            cloud_sun_tint_strength: 0.3,
            cloud_fog_enabled: true,
            cloud_fog_color_mode: "sky",
            cloud_fog_color: "#1aa6f2",
            cloud_fog_strength: 0.72,
            cloud_fog_start: 0.42,
            cloud_fog_end: 0.92,
            cloud_density: 0.95,
            cloud_absorption: 0.025,
            cloud_translucency: 0.35,
            lens_flare_enabled: true,
            lens_flare_strength: 0.45,
            lens_flare_scale: 1,
        },
        cineflow: {
            palette_mode: "custom",
            sky_custom_palette_saved: true,
            sky_custom_reference_match: true,
            sky_cycle_mode: "reference",
            zenith_color: "#41b6f8",
            horizon_color: "#e4f8ea",
            sunrise_zenith_color: "#5473a5",
            sunrise_horizon_color: "#d1b5aa",
            night_zenith_color: "#040f22",
            night_horizon_color: "#3a72ae",
            ground_color: "#c4dcd7",
            sun_color: "#fff1cf",
            moon_color: "#bdd5ff",
            cloud_color: "#f6f5ee",
            sky_intensity: 1,
            sky_gradient_power: 1,
            sky_time_gradients_enabled: true,
            sky_time_gradients: [
                {"id": "clock_1500_4", "time": 1500, "gradient": {"version": 2, "color_space": "hsl", "interpolation": "smooth", "stops": [{"id": "clock_1500_ground", "position": 0, "color": "#e2f8fc", "midpoint": 0.5}, {"id": "clock_1500_horizon", "position": 0.5, "color": "#e2f8fc", "midpoint": 0.5}, {"id": "clock_1500_zenith", "position": 1, "color": "#1e84d3", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_day", "phase": "day", "time": 6000, "gradient": {"version": 2, "color_space": "hsl", "interpolation": "smooth", "stops": [{"id": "day_ground", "position": 0, "color": "#e2f8fc", "midpoint": 0.5}, {"id": "day_horizon", "position": 0.5, "color": "#e2f8fc", "midpoint": 0.397183055609045}, {"id": "day_zenith", "position": 1, "color": "#1e84d3", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_sunset", "phase": "sunset", "time": 12500, "gradient": {"version": 2, "color_space": "oklab", "interpolation": "smooth", "stops": [{"id": "sunset_ground", "position": 0, "color": "#fff29e", "midpoint": 0.5}, {"id": "sunset_horizon", "position": 0.5, "color": "#fff29e", "midpoint": 0.5}, {"id": "e5cbb762-09a4-5829-e236-f2cd1db921a3", "position": 0.7341549295774648, "color": "#f87531", "midpoint": 0.5}, {"id": "sunset_zenith", "position": 1, "color": "#d6191c", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_night", "phase": "night", "time": 18000, "gradient": {"version": 2, "color_space": "hsl", "interpolation": "smooth", "stops": [{"id": "night_ground", "position": 0, "color": "#0b1828", "midpoint": 0.5}, {"id": "night_horizon", "position": 0.5, "color": "#3a72ae", "midpoint": 0.5}, {"id": "night_middle", "position": 0.74, "color": "#22416f", "midpoint": 0.5}, {"id": "night_zenith", "position": 1, "color": "#040f22", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
                {"id": "sky_sunrise", "phase": "sunrise", "time": 23500, "gradient": {"version": 2, "color_space": "oklab", "interpolation": "smooth", "stops": [{"id": "sunrise_ground", "position": 0, "color": "#d1b5aa", "midpoint": 0.5}, {"id": "sunrise_horizon", "position": 0.5, "color": "#d1b5aa", "midpoint": 0.5}, {"id": "sunrise_zenith", "position": 1, "color": "#362791", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5}},
            ],
            day_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "day_ground", "position": 0, "color": "#c4dcd7", "midpoint": 0.5}, {"id": "day_horizon", "position": 0.5, "color": "#e4f8ea", "midpoint": 0.5}, {"id": "day_middle", "position": 0.74, "color": "#77cef5", "midpoint": 0.5}, {"id": "day_zenith", "position": 1, "color": "#41b6f8", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunrise_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunrise_ground", "position": 0, "color": "#7c687b", "midpoint": 0.5}, {"id": "sunrise_horizon", "position": 0.5, "color": "#d1b5aa", "midpoint": 0.5}, {"id": "sunrise_middle", "position": 0.74, "color": "#9690c1", "midpoint": 0.5}, {"id": "sunrise_zenith", "position": 1, "color": "#5473a5", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunset_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "sunset_ground", "position": 0, "color": "#4f4061", "midpoint": 0.5}, {"id": "sunset_horizon", "position": 0.5, "color": "#a06879", "midpoint": 0.5}, {"id": "sunset_middle", "position": 0.74, "color": "#4d3571", "midpoint": 0.5}, {"id": "sunset_zenith", "position": 1, "color": "#151140", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            night_sky_gradient: {"version": 2, "color_space": "srgb", "interpolation": "smooth", "stops": [{"id": "night_ground", "position": 0, "color": "#0b1828", "midpoint": 0.5}, {"id": "night_horizon", "position": 0.5, "color": "#3a72ae", "midpoint": 0.5}, {"id": "night_middle", "position": 0.74, "color": "#22416f", "midpoint": 0.5}, {"id": "night_zenith", "position": 1, "color": "#040f22", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            star_density: 1,
            environment_strength: 0.75,
            ambient_fill_color_mode: "sky",
            ambient_fill_shape: "preset",
            ambient_fill_sky_color: "#ffffff",
            ambient_fill_ground_color: "#ffffff",
            ambient_fill_day_multiplier: 1,
            ambient_fill_night_multiplier: 1,
            sun_enabled: true,
            sun_intensity: 2.2,
            sun_light_color_mode: "sun",
            sun_light_day_color: "#fff7c7",
            sun_light_twilight_color: "#ffad74",
            moon_intensity: 0.28,
            moon_light_color_mode: "moon",
            moon_light_custom_color: "#a9c8ff",
            celestial_size: 0.25,
            moon_size: 0.25,
            moon_phase: 0,
            sun_mode: "vanilla",
            moon_mode: "vanilla",
            sun_blend_mode: "additive",
            sun_opacity: 1,
            moon_blend_mode: "preset",
            moon_opacity: 1,
            moon_texture_layout: "atlas",
            moon_atlas_columns: 4,
            moon_atlas_rows: 2,
            moon_phase_offset: 0,
            sun_horizon_scale: 1,
            sun_gaze_scale: 1,
            sun_glare: 0.25,
            environment_bloom_enabled: true,
            bloom_threshold: 2.18,
            bloom_soft_knee: 0.38,
            bloom_strength: 0.72,
            bloom_core_strength: 0.46,
            bloom_core_radius: 8,
            bloom_halo_strength: 0.24,
            bloom_halo_radius: 64,
            bloom_hdr_strength: 0.75,
            bloom_emissive_strength: 1.2,
            bloom_occlusion: 0.92,
            sun_bloom_contribution: 0.78,
            moon_bloom_contribution: 1.02,
            star_bloom_contribution: 0.66,
            cloud_bloom_contribution: 0.08,
            stars_enabled: true,
            star_brightness: 0.72,
            clouds_enabled: true,
            cloud_mode: "vanilla",
            cloud_style: "vibrant_visuals",
            cloud_palette_mode: "preset",
            cloud_time_profiles_enabled: true,
            cloud_time_profiles: [
                {"id": "cloud_clock_0", "time": 0, "appearance": {"cloud_coverage": 0.54, "cloud_opacity": 0.68, "cloud_contrast": 1, "cloud_brightness": 1.45, "cloud_bevel_width": 0.14, "cloud_bevel_softness": 0.62, "cloud_bevel_roundness": 0.82, "cloud_bevel_strength": 0.72, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.42, "cloud_sun_tint_strength": 0.58, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1, "cloud_absorption": 0, "cloud_translucency": 0.28, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 0.55, "cloud_gradient_alpha": 0.9, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.08, "cloud_top_color": "#f6f5ee", "cloud_sun_side_color": "#f6f5ee", "cloud_shadow_side_color": "#f6f5ee", "cloud_bottom_color": "#f6f5ee", "cloud_edge_color": "#f6f5ee", "cloud_shadow_bevel_color": "#9daec7", "cloud_fog_color": "#cbe1ee"}},
                {"id": "cloud_clock_6000", "time": 6000, "appearance": {"cloud_coverage": 0.54, "cloud_opacity": 0.68, "cloud_contrast": 1, "cloud_brightness": 1.25, "cloud_bevel_width": 0, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 0, "cloud_bevel_distance_min_scale": 0.02, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 0.82, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 1, "cloud_sun_tint_strength": 0.69, "cloud_fog_strength": 0.77, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1, "cloud_absorption": 0, "cloud_translucency": 0.28, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 0.35, "cloud_gradient_alpha": 0.66, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.08, "cloud_top_color": "#f6f5ee", "cloud_sun_side_color": "#f6f5ee", "cloud_shadow_side_color": "#f6f5ee", "cloud_bottom_color": "#f6f5ee", "cloud_edge_color": "#f6f5ee", "cloud_shadow_bevel_color": "#c9d8ee", "cloud_fog_color": "#cbe1ee"}},
                {"id": "cloud_clock_12000", "time": 12000, "appearance": {"cloud_coverage": 0.54, "cloud_opacity": 0.68, "cloud_contrast": 1, "cloud_brightness": 1.165, "cloud_bevel_width": 0.07, "cloud_bevel_softness": 0.31, "cloud_bevel_roundness": 0.41, "cloud_bevel_strength": 0.36, "cloud_bevel_distance_min_scale": 0.15, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 0.58, "cloud_environment_influence": 0.55, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.71, "cloud_sun_tint_strength": 0.635, "cloud_fog_strength": 0.745, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1, "cloud_absorption": 0, "cloud_translucency": 0.28, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 0.7, "cloud_gradient_alpha": 0.76, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.08, "cloud_top_color": "#f6f5ee", "cloud_sun_side_color": "#f6f5ee", "cloud_shadow_side_color": "#f6f5ee", "cloud_bottom_color": "#f6f5ee", "cloud_edge_color": "#f6f5ee", "cloud_shadow_bevel_color": "#b3c3db", "cloud_fog_color": "#cbe1ee"}},
                {"id": "cloud_clock_18000", "time": 18000, "appearance": {"cloud_coverage": 0.8, "cloud_opacity": 0.68, "cloud_contrast": 1, "cloud_brightness": 4, "cloud_bevel_width": 0.14, "cloud_bevel_softness": 0.62, "cloud_bevel_roundness": 0.82, "cloud_bevel_strength": 0.72, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.42, "cloud_sun_tint_strength": 0.58, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1, "cloud_absorption": 0, "cloud_translucency": 0.28, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0.52, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.08, "cloud_top_color": "#f6f5ee", "cloud_sun_side_color": "#f6f5ee", "cloud_shadow_side_color": "#f6f5ee", "cloud_bottom_color": "#f6f5ee", "cloud_edge_color": "#f6f5ee", "cloud_shadow_bevel_color": "#9daec7", "cloud_fog_color": "#cbe1ee"}},
                {"id": "cloud_clock_23000", "time": 23000, "appearance": {"cloud_coverage": 0.54, "cloud_opacity": 0.68, "cloud_contrast": 0.4, "cloud_brightness": 2.25, "cloud_bevel_width": 0.14, "cloud_bevel_softness": 0.62, "cloud_bevel_roundness": 0.82, "cloud_bevel_strength": 0.72, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 0.2, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 0.86, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.42, "cloud_sun_tint_strength": 0.58, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 1.1, "cloud_absorption": 0, "cloud_translucency": 1, "cloud_scattering_strength": 0, "cloud_scattering_size": 0.4, "cloud_edge_hardness": 0.12, "cloud_view_response": 0, "cloud_gradient_thickness": 0.7, "cloud_gradient_alpha": 0, "cloud_optical_thickness": 1.85, "cloud_phase_anisotropy": 0.85, "cloud_density_variation": 0, "cloud_bloom_contribution": 0.08, "cloud_top_color": "#f6f5ee", "cloud_sun_side_color": "#f6f5ee", "cloud_shadow_side_color": "#f6f5ee", "cloud_bottom_color": "#f6f5ee", "cloud_edge_color": "#f6f5ee", "cloud_shadow_bevel_color": "#9daec7", "cloud_fog_color": "#cbe1ee"}},
            ],
            cloud_coverage: 0.54,
            cloud_opacity: 0.68,
            cloud_speed: 0.016,
            cloud_scale: 1,
            cloud_direction: 0,
            cloud_contrast: 1,
            cloud_brightness: 1.08,
            cloud_height: 128,
            cloud_thickness: 2,
            cloud_extrusion: 1,
            cloud_top_color: "#f6f5ee",
            cloud_sun_side_color: "#f6f5ee",
            cloud_shadow_side_color: "#f6f5ee",
            cloud_bottom_color: "#f6f5ee",
            cloud_edge_color: "#f6f5ee",
            cloud_bevel_width: 0.14,
            cloud_bevel_softness: 0.62,
            cloud_bevel_roundness: 0.82,
            cloud_bevel_strength: 0.72,
            cloud_bevel_enabled: false,
            cloud_bevel_smooth: true,
            cloud_scattering_strength: 1,
            cloud_scattering_size: 1,
            cloud_edge_hardness: 0,
            cloud_view_response: 0,
            cloud_gradient_thickness: 1,
            cloud_gradient_alpha: 0,
            cloud_optical_thickness: 1,
            cloud_phase_anisotropy: 0.46,
            cloud_density_variation: 0.03,
            cloud_bevel_distance_fade: true,
            cloud_bevel_distance_min_scale: 0.28,
            cloud_edge_strength: 0.2,
            cloud_shadow_bevel_color: "#9daec7",
            cloud_shadow_bevel_strength: 0.34,
            cloud_lighting_mode: "mixed",
            cloud_environment_influence: 1,
            cloud_time_tint_strength: 1,
            cloud_sky_tint_strength: 0.42,
            cloud_sun_tint_strength: 0.58,
            cloud_fog_enabled: true,
            cloud_fog_color_mode: "sky",
            cloud_fog_color: "#cbe1ee",
            cloud_fog_strength: 0.72,
            cloud_fog_start: 0.42,
            cloud_fog_end: 0.92,
            cloud_density: 1,
            cloud_absorption: 0,
            cloud_translucency: 0.28,
            lens_flare_enabled: false,
            lens_flare_strength: 0.45,
            lens_flare_scale: 1,
        },
        vibrant_visuals: {
            palette_mode: "preset",
            sky_custom_palette_saved: false,
            sky_custom_reference_match: false,
            sky_cycle_mode: "reference",
            zenith_color: "#79a7ff",
            horizon_color: "#bdd6ff",
            sunrise_zenith_color: "#647db5",
            sunrise_horizon_color: "#f59a62",
            night_zenith_color: "#05091d",
            night_horizon_color: "#151d3d",
            ground_color: "#bdd6ff",
            sun_color: "#fff1b0",
            moon_color: "#cbdcff",
            cloud_color: "#fff7ec",
            sky_intensity: 1,
            sky_gradient_power: 1,
            sky_time_gradients_enabled: false,
            sky_time_gradients: [
            ],
            day_sky_gradient: {"version": 2, "color_space": "oklab", "interpolation": "smooth", "stops": [{"id": "day_ground", "position": 0, "color": "#bdd6ff", "midpoint": 0.5}, {"id": "day_horizon", "position": 0.5, "color": "#bdd6ff", "midpoint": 0.5}, {"id": "day_zenith", "position": 1, "color": "#79a7ff", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunrise_sky_gradient: {"version": 2, "color_space": "oklab", "interpolation": "smooth", "stops": [{"id": "sunrise_ground", "position": 0, "color": "#6a5973", "midpoint": 0.48}, {"id": "sunrise_horizon", "position": 0.5, "color": "#f59a62", "midpoint": 0.46}, {"id": "sunrise_middle", "position": 0.76, "color": "#8a78c4", "midpoint": 0.54}, {"id": "sunrise_zenith", "position": 1, "color": "#647db5", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            sunset_sky_gradient: null,
            night_sky_gradient: {"version": 2, "color_space": "oklab", "interpolation": "smooth", "stops": [{"id": "night_ground", "position": 0, "color": "#0a0c16", "midpoint": 0.48}, {"id": "night_horizon", "position": 0.5, "color": "#151d3d", "midpoint": 0.48}, {"id": "night_middle", "position": 0.74, "color": "#0b102d", "midpoint": 0.5}, {"id": "night_zenith", "position": 1, "color": "#05091d", "midpoint": 0.5}], "domain": "full_sky", "horizon_position": 0.5},
            star_density: 1,
            environment_strength: 0.92,
            ambient_fill_color_mode: "sky",
            ambient_fill_shape: "preset",
            ambient_fill_sky_color: "#ffffff",
            ambient_fill_ground_color: "#ffffff",
            ambient_fill_day_multiplier: 1,
            ambient_fill_night_multiplier: 1,
            sun_enabled: true,
            sun_intensity: 2.8,
            sun_light_color_mode: "sun",
            sun_light_day_color: "#fff7c7",
            sun_light_twilight_color: "#ffad74",
            moon_intensity: 0.28,
            moon_light_color_mode: "moon",
            moon_light_custom_color: "#a9c8ff",
            celestial_size: 0.25,
            moon_size: 0.25,
            moon_phase: 0,
            sun_mode: "vanilla",
            moon_mode: "vanilla",
            sun_blend_mode: "preset",
            sun_opacity: 1,
            moon_blend_mode: "additive",
            moon_opacity: 1,
            moon_texture_layout: "atlas",
            moon_atlas_columns: 4,
            moon_atlas_rows: 2,
            moon_phase_offset: 0,
            sun_horizon_scale: 1,
            sun_gaze_scale: 1,
            sun_glare: 0,
            environment_bloom_enabled: true,
            bloom_threshold: 0.82,
            bloom_soft_knee: 0.42,
            bloom_strength: 0.28,
            bloom_core_strength: 0.48,
            bloom_core_radius: 1.25,
            bloom_halo_strength: 0.08,
            bloom_halo_radius: 6,
            bloom_hdr_strength: 1.15,
            bloom_emissive_strength: 1.2,
            bloom_occlusion: 0.92,
            sun_bloom_contribution: 0.44,
            moon_bloom_contribution: 0.2,
            star_bloom_contribution: 0.08,
            cloud_bloom_contribution: 0.015,
            stars_enabled: true,
            star_brightness: 0.72,
            clouds_enabled: true,
            cloud_mode: "vanilla",
            cloud_style: "vibrant_visuals",
            cloud_palette_mode: "preset",
            cloud_time_profiles_enabled: true,
            cloud_time_profiles: [
                {"id": "cloud_clock_6000", "time": 6000, "appearance": {"cloud_coverage": 0.5, "cloud_opacity": 0.76, "cloud_contrast": 1, "cloud_brightness": 1.25, "cloud_bevel_width": 0.02, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 1.2, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 0.16, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.18, "cloud_sun_tint_strength": 0.22, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.85, "cloud_absorption": 0, "cloud_translucency": 0.65, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0.77, "cloud_gradient_thickness": 1, "cloud_gradient_alpha": 0.53, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.015, "cloud_top_color": "#fff9ee", "cloud_sun_side_color": "#eeeaf4", "cloud_shadow_side_color": "#d7d9e8", "cloud_bottom_color": "#d4d8e7", "cloud_edge_color": "#fff4dc", "cloud_shadow_bevel_color": "#adbad0", "cloud_fog_color": "#a6dcff"}},
                {"id": "cloud_clock_12000", "time": 12000, "appearance": {"cloud_coverage": 0.5, "cloud_opacity": 0.76, "cloud_contrast": 1, "cloud_brightness": 1.25, "cloud_bevel_width": 0, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 0.76, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 0.14, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.18, "cloud_sun_tint_strength": 0.22, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.85, "cloud_absorption": 0, "cloud_translucency": 0.65, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0, "cloud_gradient_thickness": 0.25, "cloud_gradient_alpha": 0.78, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.015, "cloud_top_color": "#fff9ee", "cloud_sun_side_color": "#eeeaf4", "cloud_shadow_side_color": "#d7d9e8", "cloud_bottom_color": "#d4d8e7", "cloud_edge_color": "#fff4dc", "cloud_shadow_bevel_color": "#adbad0", "cloud_fog_color": "#a6dcff"}},
                {"id": "cloud_clock_18000", "time": 18000, "appearance": {"cloud_coverage": 0.5, "cloud_opacity": 0.76, "cloud_contrast": 1, "cloud_brightness": 1.12, "cloud_bevel_width": 0.02, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 1.58, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 2, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.18, "cloud_sun_tint_strength": 0.22, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.85, "cloud_absorption": 0, "cloud_translucency": 0.65, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0.35, "cloud_gradient_thickness": 0.15, "cloud_gradient_alpha": 0.33, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.015, "cloud_top_color": "#fff9ee", "cloud_sun_side_color": "#eeeaf4", "cloud_shadow_side_color": "#d7d9e8", "cloud_bottom_color": "#d4d8e7", "cloud_edge_color": "#fff4dc", "cloud_shadow_bevel_color": "#adbad0", "cloud_fog_color": "#a6dcff"}},
                {"id": "cloud_clock_23000", "time": 23000, "appearance": {"cloud_coverage": 0.5, "cloud_opacity": 0.76, "cloud_contrast": 1, "cloud_brightness": 1.4, "cloud_bevel_width": 0.02, "cloud_bevel_softness": 0, "cloud_bevel_roundness": 0, "cloud_bevel_strength": 1.2, "cloud_bevel_distance_min_scale": 0.28, "cloud_edge_strength": 1.36, "cloud_shadow_bevel_strength": 0.34, "cloud_environment_influence": 1, "cloud_time_tint_strength": 1, "cloud_sky_tint_strength": 0.18, "cloud_sun_tint_strength": 0.22, "cloud_fog_strength": 0.72, "cloud_fog_start": 0.42, "cloud_fog_end": 0.92, "cloud_density": 0.85, "cloud_absorption": 0, "cloud_translucency": 0.65, "cloud_scattering_strength": 1, "cloud_scattering_size": 1, "cloud_edge_hardness": 0, "cloud_view_response": 0.73, "cloud_gradient_thickness": 0.2, "cloud_gradient_alpha": 0.26, "cloud_optical_thickness": 1, "cloud_phase_anisotropy": 0.46, "cloud_density_variation": 0.03, "cloud_bloom_contribution": 0.015, "cloud_top_color": "#fff9ee", "cloud_sun_side_color": "#eeeaf4", "cloud_shadow_side_color": "#d7d9e8", "cloud_bottom_color": "#d4d8e7", "cloud_edge_color": "#fff4dc", "cloud_shadow_bevel_color": "#adbad0", "cloud_fog_color": "#a6dcff"}},
            ],
            cloud_coverage: 0.5,
            cloud_opacity: 0.76,
            cloud_speed: 0.016,
            cloud_scale: 1.35,
            cloud_direction: 0,
            cloud_contrast: 1,
            cloud_brightness: 1.12,
            cloud_height: 128,
            cloud_thickness: 3,
            cloud_extrusion: 1,
            cloud_top_color: "#fff9ee",
            cloud_sun_side_color: "#eeeaf4",
            cloud_shadow_side_color: "#d7d9e8",
            cloud_bottom_color: "#d4d8e7",
            cloud_edge_color: "#fff4dc",
            cloud_bevel_width: 0.02,
            cloud_bevel_softness: 0,
            cloud_bevel_roundness: 0,
            cloud_bevel_strength: 1.2,
            cloud_bevel_enabled: true,
            cloud_bevel_smooth: false,
            cloud_scattering_strength: 1,
            cloud_scattering_size: 1,
            cloud_edge_hardness: 0,
            cloud_view_response: 0,
            cloud_gradient_thickness: 1,
            cloud_gradient_alpha: 0,
            cloud_optical_thickness: 1,
            cloud_phase_anisotropy: 0.46,
            cloud_density_variation: 0.03,
            cloud_bevel_distance_fade: true,
            cloud_bevel_distance_min_scale: 0.28,
            cloud_edge_strength: 0.16,
            cloud_shadow_bevel_color: "#adbad0",
            cloud_shadow_bevel_strength: 0.34,
            cloud_lighting_mode: "mixed",
            cloud_environment_influence: 1,
            cloud_time_tint_strength: 1,
            cloud_sky_tint_strength: 0.18,
            cloud_sun_tint_strength: 0.22,
            cloud_fog_enabled: true,
            cloud_fog_color_mode: "sky",
            cloud_fog_color: "#a6dcff",
            cloud_fog_strength: 0.72,
            cloud_fog_start: 0.42,
            cloud_fog_end: 0.92,
            cloud_density: 0.85,
            cloud_absorption: 0,
            cloud_translucency: 0.65,
            lens_flare_enabled: false,
            lens_flare_strength: 0.45,
            lens_flare_scale: 1,
        },
    });

    function getNativeSkyPresetSettings(presetId, options = {}) {
        const preset = PRESETS[presetId] ? presetId : 'vanilla';
        const vibrant = preset === 'vibrant_visuals';
        const rendercraft = preset === 'rendercraft';
        const profile = {
            preset,
            palette_mode: rendercraft ? 'custom' : 'preset',
            sky_custom_palette_saved: rendercraft,
            sky_custom_reference_match: false,
            zenith_color: rendercraft ? '#41b6f8' : PRESETS[preset].zenith,
            horizon_color: rendercraft ? '#e4f8ea' : PRESETS[preset].horizon,
            sunrise_zenith_color: rendercraft ? '#5473a5' : PRESETS[preset].sunrise_zenith,
            sunrise_horizon_color: rendercraft ? '#d1b5aa' : PRESETS[preset].sunrise_horizon,
            night_zenith_color: rendercraft ? '#040f22' : PRESETS[preset].night_zenith,
            night_horizon_color: rendercraft ? '#3a72ae' : PRESETS[preset].night_horizon,
            ground_color: rendercraft ? '#c4dcd7' : PRESETS[preset].ground,
            sun_color: rendercraft ? '#fff7c7' : PRESETS[preset].sun,
            moon_color: rendercraft ? '#dce9ff' : PRESETS[preset].moon,
            cloud_color: rendercraft ? '#edf8ff' : PRESETS[preset].cloud,
            sky_intensity: 1,
            sky_gradient_power: 1,
            sky_time_gradients_enabled: rendercraft,
            sky_time_gradients: rendercraft ? [
                { id: 'clock_10000_4', time: 1500, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'clock_10000_ground', position: 0, color: '#ffd196', midpoint: 0.5 }, { id: 'clock_10000_horizon', position: 0.5, color: '#ffd196', midpoint: 0.5042253950951805 }, { id: 'clock_10000_zenith', position: 1, color: '#2773b4', midpoint: 0.5 }
                ] } },
                { id: 'clock_2000_7', time: 2500, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'clock_2000_ground', position: 0, color: '#afeeff', midpoint: 0.5 }, { id: 'clock_2000_horizon', position: 0.5, color: '#afeeff', midpoint: 0.5 }, { id: 'clock_2000_zenith', position: 1, color: '#049eff', midpoint: 0.5 }
                ] } },
                { id: 'sky_day', phase: 'day', time: 6000, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'day_ground', position: 0, color: '#afeeff', midpoint: 0.5 }, { id: 'day_horizon', position: 0.5, color: '#afeeff', midpoint: 0.5 }, { id: 'day_zenith', position: 1, color: '#049eff', midpoint: 0.5 }
                ] } },
                { id: 'clock_10000_6', time: 10000, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'clock_10000_ground', position: 0, color: '#afeeff', midpoint: 0.5 }, { id: 'clock_10000_horizon', position: 0.5, color: '#afeeff', midpoint: 0.5 }, { id: 'clock_10000_zenith', position: 1, color: '#049eff', midpoint: 0.5 }
                ] } },
                { id: 'clock_11000_5', time: 11800, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'clock_11000_ground', position: 0, color: '#ffee96', midpoint: 0.5 }, { id: 'clock_11000_horizon', position: 0.5, color: '#ffee96', midpoint: 0.5 }, { id: 'clock_11000_middle', position: 0.74, color: '#fe782f', midpoint: 0.5 }, { id: 'clock_11000_zenith', position: 1, color: '#ff6d4a', midpoint: 0.5 }
                ] } },
                { id: 'sky_sunset', phase: 'sunset', time: 12500, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'sunset_ground', position: 0, color: '#4f4061', midpoint: 0.5 }, { id: 'sunset_horizon', position: 0.5, color: '#a06879', midpoint: 0.5 }, { id: 'sunset_middle', position: 0.74, color: '#4d3571', midpoint: 0.5 }, { id: 'sunset_zenith', position: 1, color: '#151140', midpoint: 0.5 }
                ] } },
                { id: 'sky_night', phase: 'night', time: 18000, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'night_ground', position: 0, color: '#0b1828', midpoint: 0.5 }, { id: 'night_horizon', position: 0.5, color: '#3a72ae', midpoint: 0.5 }, { id: 'night_middle', position: 0.74, color: '#1d2356', midpoint: 0.5 }, { id: 'night_zenith', position: 1, color: '#0d1223', midpoint: 0.5 }
                ] } },
                { id: 'sky_sunrise', phase: 'sunrise', time: 23500, gradient: { version: 2, color_space: 'srgb', interpolation: 'smooth', domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION, stops: [
                    { id: 'sunrise_ground', position: 0, color: '#f8d679', midpoint: 0.5 }, { id: 'sunrise_horizon', position: 0.5, color: '#f8d679', midpoint: 0.5 }, { id: 'sunrise_middle', position: 0.74, color: '#9690c1', midpoint: 0.5 }, { id: 'sunrise_zenith', position: 1, color: '#545ec3', midpoint: 0.5 }
                ] } }
            ] : [],
            environment_strength: vibrant ? 0.92 : (rendercraft ? 0.74 : 0.75),
            sun_enabled: true,
            sun_intensity: vibrant ? 2.8 : (rendercraft ? 2.45 : 2.2),
            sun_light_color_mode: rendercraft ? 'time' : DEFAULT_SETTINGS.sun_light_color_mode,
            sun_light_day_color: rendercraft ? '#fff7c7' : DEFAULT_SETTINGS.sun_light_day_color,
            sun_light_twilight_color: rendercraft ? '#ffad74' : DEFAULT_SETTINGS.sun_light_twilight_color,
            moon_intensity: rendercraft ? 0.28 : DEFAULT_SETTINGS.moon_intensity,
            moon_light_color_mode: rendercraft ? 'moon' : DEFAULT_SETTINGS.moon_light_color_mode,
            moon_light_custom_color: rendercraft ? '#a9c8ff' : DEFAULT_SETTINGS.moon_light_custom_color,
            celestial_size: rendercraft ? 0.25 : (vibrant ? 0.13 : 0.25),
            moon_size: rendercraft ? 0.25 : 0.13,
            sun_horizon_scale: rendercraft ? 2.5 : 1,
            sun_gaze_scale: 1,
            sun_glare: rendercraft ? 0.75 : (vibrant ? 0.32 : 0.25),
            sunset_directional_glow: 1,
            environment_bloom_enabled: rendercraft || vibrant,
            bloom_threshold: rendercraft ? 0.78 : DEFAULT_SETTINGS.bloom_threshold,
            bloom_soft_knee: rendercraft ? 0.48 : DEFAULT_SETTINGS.bloom_soft_knee,
            bloom_strength: rendercraft ? 0.84 : (vibrant ? 0.28 : DEFAULT_SETTINGS.bloom_strength),
            bloom_core_strength: rendercraft ? 0.82 : (vibrant ? 0.48 : DEFAULT_SETTINGS.bloom_core_strength),
            bloom_core_radius: rendercraft ? 1.15 : DEFAULT_SETTINGS.bloom_core_radius,
            bloom_halo_strength: rendercraft ? 0.26 : (vibrant ? 0.08 : DEFAULT_SETTINGS.bloom_halo_strength),
            bloom_halo_radius: rendercraft ? 10.5 : (vibrant ? 6 : DEFAULT_SETTINGS.bloom_halo_radius),
            bloom_hdr_strength: rendercraft ? 0.7 : DEFAULT_SETTINGS.bloom_hdr_strength,
            bloom_emissive_strength: rendercraft ? 1.25 : DEFAULT_SETTINGS.bloom_emissive_strength,
            bloom_occlusion: rendercraft ? 0.95 : DEFAULT_SETTINGS.bloom_occlusion,
            sun_bloom_contribution: rendercraft ? 0.25 : (vibrant ? 1 : DEFAULT_SETTINGS.sun_bloom_contribution),
            moon_bloom_contribution: rendercraft ? 0.92 : (vibrant ? 0.20 : DEFAULT_SETTINGS.moon_bloom_contribution),
            star_bloom_contribution: rendercraft ? 0.38 : (vibrant ? 0.08 : DEFAULT_SETTINGS.star_bloom_contribution),
            cloud_bloom_contribution: rendercraft ? 0.2 : (vibrant ? 0.015 : DEFAULT_SETTINGS.cloud_bloom_contribution),
            shadow_resolution: vibrant ? 2048 : DEFAULT_SETTINGS.shadow_resolution,
            shadow_softness_mode: 'hard',
            pixelated_shadows: vibrant,
            pixel_shadow_steps: vibrant ? 4 : DEFAULT_SETTINGS.pixel_shadow_steps,
            pixel_shadow_scale: vibrant ? 2 : DEFAULT_SETTINGS.pixel_shadow_scale,
            cloud_coverage: vibrant ? 0.5 : (rendercraft ? 0.44 : 0.54),
            cloud_opacity: vibrant ? 0.76 : (rendercraft ? 0.90 : 0.68),
            cloud_speed: rendercraft ? 0.01 : 0.016,
            cloud_scale: rendercraft ? 0.72 : (vibrant ? 1.35 : 1),
            cloud_contrast: rendercraft ? 4 : 1,
            cloud_brightness: rendercraft ? 1.25 : (vibrant ? 1.12 : 1.08),
            cloud_height: 128,
            cloud_thickness: vibrant ? 3 : (rendercraft ? 5 : 4),
            cloud_extrusion: 1,
            cloud_mode: 'vanilla',
            cloud_style: rendercraft ? 'rendercraft' : (vibrant ? 'vibrant_visuals' : 'vanilla'),
            cloud_palette_mode: 'preset',
            sun_blend_mode: rendercraft ? 'additive' : DEFAULT_SETTINGS.sun_blend_mode,
            sun_opacity: 1,
            moon_blend_mode: 'preset',
            moon_opacity: 1,
            cloud_time_profiles_enabled: rendercraft,
            cloud_time_profiles: rendercraft ? (() => {
                const base = {
                    cloud_coverage: 0.44, cloud_opacity: 0.9, cloud_contrast: 4, cloud_brightness: 1.25,
                    cloud_bevel_width: 0.025, cloud_bevel_softness: 0, cloud_bevel_roundness: 0,
                    cloud_bevel_strength: 2, cloud_bevel_distance_min_scale: 0.22, cloud_edge_strength: 2,
                    cloud_shadow_bevel_strength: 1.32, cloud_sky_tint_strength: 0.25, cloud_sun_tint_strength: 0.3,
                    cloud_fog_strength: 0.72, cloud_fog_start: 0.42, cloud_fog_end: 0.92, cloud_density: 0.95,
                    cloud_absorption: 0.025, cloud_translucency: 0.35, cloud_bloom_contribution: 0.2,
                    cloud_top_color: '#fcfeff', cloud_sun_side_color: '#e9f4fa', cloud_shadow_side_color: '#bed2e2',
                    cloud_bottom_color: '#8fa8bc', cloud_edge_color: '#fff3c4', cloud_shadow_bevel_color: '#7f98ad',
                    cloud_fog_color: '#1aa6f2'
                };
                const frames = [
                    ['cloud_clock_0', 0, {}],
                    ['cloud_clock_6000', 6000, { cloud_brightness: 1.85, cloud_absorption: 0.1, cloud_translucency: 0.32 }],
                    ['cloud_clock_12000', 12000, { cloud_opacity: 0.76, cloud_brightness: 2.65, cloud_sky_tint_strength: 1, cloud_sun_tint_strength: 1, cloud_density: 0.4, cloud_absorption: 0.08, cloud_translucency: 1, cloud_bottom_color: '#ffe197' }],
                    ['cloud_clock_18000', 18000, { cloud_opacity: 0.54, cloud_brightness: 1.75, cloud_density: 1.85 }],
                    ['cloud_clock_23000', 23000, { cloud_coverage: 0.54, cloud_opacity: 0.34, cloud_brightness: 1.85, cloud_sky_tint_strength: 1, cloud_sun_tint_strength: 0.34, cloud_fog_strength: 1, cloud_absorption: 0, cloud_translucency: 1 }]
                ];
                return frames.map(([id, time, overrides]) => ({ id, time, appearance: { ...base, ...overrides } }));
            })() : [],
            cloud_top_color: PRESETS[preset].cloud_top || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_top_color,
            cloud_sun_side_color: PRESETS[preset].cloud_sun_side || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_sun_side_color,
            cloud_shadow_side_color: PRESETS[preset].cloud_shadow_side || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_shadow_side_color,
            cloud_bottom_color: PRESETS[preset].cloud_bottom || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_bottom_color,
            cloud_edge_color: PRESETS[preset].cloud_edge || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_edge_color,
            cloud_bevel_width: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.width : (vibrant ? 0.02 : DEFAULT_SETTINGS.cloud_bevel_width),
            cloud_bevel_softness: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.softness : (vibrant ? 0 : DEFAULT_SETTINGS.cloud_bevel_softness),
            cloud_bevel_roundness: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.roundness : (vibrant ? 0 : DEFAULT_SETTINGS.cloud_bevel_roundness),
            cloud_bevel_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.strength : (vibrant ? 1.2 : DEFAULT_SETTINGS.cloud_bevel_strength),
            cloud_bevel_enabled: true,
            cloud_scattering_strength: DEFAULT_SETTINGS.cloud_scattering_strength,
            cloud_scattering_size: DEFAULT_SETTINGS.cloud_scattering_size,
            cloud_edge_hardness: DEFAULT_SETTINGS.cloud_edge_hardness,
            cloud_view_response: DEFAULT_SETTINGS.cloud_view_response,
            cloud_gradient_thickness: DEFAULT_SETTINGS.cloud_gradient_thickness,
            cloud_gradient_alpha: DEFAULT_SETTINGS.cloud_gradient_alpha,
            cloud_optical_thickness: DEFAULT_SETTINGS.cloud_optical_thickness,
            cloud_phase_anisotropy: DEFAULT_SETTINGS.cloud_phase_anisotropy,
            cloud_density_variation: DEFAULT_SETTINGS.cloud_density_variation,
            cloud_bevel_smooth: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.smooth : (vibrant ? false : DEFAULT_SETTINGS.cloud_bevel_smooth),
            cloud_bevel_distance_fade: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.distanceFade : DEFAULT_SETTINGS.cloud_bevel_distance_fade,
            cloud_bevel_distance_min_scale: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.distanceMinScale : DEFAULT_SETTINGS.cloud_bevel_distance_min_scale,
            cloud_edge_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.highlightStrength : (vibrant ? 0.16 : DEFAULT_SETTINGS.cloud_edge_strength),
            cloud_shadow_bevel_color: PRESETS[preset].cloud_shadow_edge || DEFAULT_SETTINGS.cloud_shadow_bevel_color,
            cloud_shadow_bevel_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.shadowStrength : DEFAULT_SETTINGS.cloud_shadow_bevel_strength,
            cloud_lighting_mode: rendercraft || vibrant ? 'mixed' : DEFAULT_SETTINGS.cloud_lighting_mode,
            cloud_sky_tint_strength: rendercraft ? 0.25 : (vibrant ? 0.18 : DEFAULT_SETTINGS.cloud_sky_tint_strength),
            cloud_sun_tint_strength: rendercraft ? 0.30 : (vibrant ? 0.22 : DEFAULT_SETTINGS.cloud_sun_tint_strength),
            cloud_fog_enabled: rendercraft || vibrant,
            cloud_fog_color_mode: 'sky',
            cloud_fog_color: rendercraft ? '#1aa6f2' : (PRESETS[preset].horizon || DEFAULT_SETTINGS.cloud_fog_color),
            cloud_fog_strength: rendercraft ? 0.72 : DEFAULT_SETTINGS.cloud_fog_strength,
            cloud_fog_start: rendercraft ? 0.42 : DEFAULT_SETTINGS.cloud_fog_start,
            cloud_fog_end: rendercraft ? 0.92 : DEFAULT_SETTINGS.cloud_fog_end,
            cloud_density: rendercraft ? 0.95 : (vibrant ? 0.85 : DEFAULT_SETTINGS.cloud_density),
            cloud_absorption: rendercraft ? 0.025 : DEFAULT_SETTINGS.cloud_absorption,
            cloud_translucency: vibrant ? 0.65 : (rendercraft ? 0.35 : 0.28),
            sun_mode: 'vanilla',
            moon_mode: 'vanilla'
        };
        return normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, profile,
            cloneEnvironmentData(AUTHORED_NATIVE_SKY_SETTINGS[preset] || {}), {
            enabled: options.enabled !== undefined ? !!options.enabled : settings.enabled
        }));
    }

    function applyPreset(presetId, options = {}) {
        return selectEnvironmentSkyPreset(presetId, {
            ...options,
            cause: options.cause || 'preset'
        });
    }

    function getVirtualLight(options = {}) {
        if (!sunLight) return null;
        const state = getCelestialLightingState();
        const inactive = !state.enabled || !settings.sun_enabled || state.sunIntensity <= 0.0001;
        const retainedShadowSlot = options?.includeInactiveShadowSlot === true && inactive &&
            settings.sun_cast_shadows && sunLight?.castShadow === true &&
            sunLight.userData?.lightflowEnvironmentRetainShadowSlot === true;
        if (!sunLight || (inactive && !retainedShadowSlot)) return null;
        return {
            uuid: sunLight.uuid,
            light_type: 'directional',
            visibility: true,
            has_shadow: retainedShadowSlot || isSunShadowActive(state),
            render_intensity: state.sunIntensity,
            intensity: state.sunIntensity,
            render_color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            shadow_softness: settings.shadow_softness,
            shadow_softness_mode: settings.pixelated_shadows ? 'hard' : settings.shadow_softness_mode,
            shadow_blur: settings.shadow_blur,
            shadow_camera_quality: settings.shadow_camera_quality,
            shadow_camera_distance: settings.shadow_camera_distance,
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
            shadow_scene_fit: false,
            shadow_region_locked: true,
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

    const ENVIRONMENT_DIALOG_SECTIONS = {
        _time: { label: 'lightflow_environment.group.time', icon: 'schedule' },
        _sky_colors: { label: 'lightflow_environment.group.sky', icon: 'palette' },
        _fog: { label: 'lightflow_environment.group.fog', icon: 'blur_on' },
        _celestial: { label: 'lightflow_environment.group.celestial', icon: 'wb_sunny' },
        _sky: { label: 'lightflow_environment.group.weather', icon: 'cloud' },
        _bloom: { label: 'lightflow_environment.group.bloom', icon: 'flare' },
        _shadows: { label: 'lightflow_environment.group.shadows', icon: 'ev_shadow' }
    };

    const ENVIRONMENT_SELECT_ICONS = {
        preset: { vanilla: 'landscape', vibrant_visuals: 'auto_awesome', rendercraft: 'view_in_ar' },
        palette_mode: { preset: 'palette', custom: 'colorize' },
        ambient_fill_color_mode: { sky: 'landscape', custom: 'colorize' },
        ambient_fill_shape: { preset: 'auto_awesome', flat: 'crop_square', hemisphere: 'brightness_6' },
        sun_light_color_mode: { sun: 'wb_sunny', time: 'schedule' },
        moon_light_color_mode: { moon: 'nights_stay', custom: 'colorize' },
        distance_fog_color_mode: { sky: 'landscape', time: 'schedule', fixed: 'format_color_fill' },
        moon_phase: { 0: 'brightness_1', 1: 'brightness_2', 2: 'brightness_3', 3: 'brightness_4', 4: 'brightness_5', 5: 'brightness_6', 6: 'brightness_7', 7: 'brightness_2' },
        sun_mode: { vanilla: 'wb_sunny', texture: 'texture', hidden: 'visibility_off' },
        moon_mode: { vanilla: 'nights_stay', texture: 'texture', hidden: 'visibility_off' },
        sun_blend_mode: { preset: 'auto_awesome', alpha: 'layers', additive: 'add', multiply: 'close' },
        moon_blend_mode: { preset: 'auto_awesome', alpha: 'layers', additive: 'add', multiply: 'close' },
        moon_texture_layout: { atlas: 'grid_view', single: 'crop_square' },
        cloud_mode: { procedural: 'grain', vanilla: 'cloud', texture: 'texture' },
        cloud_style: { vanilla: 'cloud_queue', rendercraft: 'view_in_ar', vibrant_visuals: 'auto_awesome' },
        cloud_palette_mode: { preset: 'palette', custom: 'colorize' },
        shadow_resolution: { 256: 'grid_4x4', 512: 'grid_4x4', 1024: 'grid_on', 2048: 'grid_on', 4096: 'high_quality', 8192: 'high_quality' },
        studio_shadow_resolution: { 0: 'monitor', 256: 'switch_access', 512: 'high_density', 1024: '1k', 2048: '2k', 4096: '4k', 8192: '8k', 16384: 'pages' }
    };

    function getEnvironmentFormUI() {
        const api = window.LightManagerUI;
        const required = ['bar_display', 'combo_slider', 'compact_select', 'custom_checkbox', 'action_button', 'gradient_editor', 'panel_search'];
        return api && required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getEnvironmentSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = ENVIRONMENT_SELECT_ICONS[key] || {};
        const fallbackIcon = key.includes('texture') ? 'texture' : 'tune';
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: tr(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || fallbackIcon
                }];
            }
            return [optionKey, {
                name: tr(option, option || optionKey),
                icon: iconMap[optionKey] || fallbackIcon
            }];
        }));
    }

    function parseEnvironmentClockTime(value, fallback) {
        if (String(value).trim() === formatSkyClockTime(fallback)) return fallback;
        const clock = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
        if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
            return mod(Math.round((Number(clock[1]) * 60 + Number(clock[2])) * 24000 / 1440) - 6000, 24000);
        }
        return /^\d{1,5}$/.test(String(value).trim()) && Number(value) <= 23999 ? Number(value) : fallback;
    }

    function readEnvironmentFrameTime(form, current) {
        const ticks = Math.round(clamp(finite(form.frame_time, current), 0, 23999));
        return ticks !== current ? ticks : parseEnvironmentClockTime(form.frame_clock, current);
    }

    function readEnvironmentNewTime(dialog) {
        const time = parseEnvironmentClockTime(dialog.form.form_data.add_time.getValue(), NaN);
        if (!Number.isFinite(time)) {
            Blockbench.showQuickMessage(tr('lightflow_environment.info.invalid_clock'));
            return null;
        }
        return time;
    }

    function environmentTimeOptions(frames) {
        return Object.fromEntries([...frames].sort((a, b) => a.time - b.time).map(frame => {
            const appearance = frame.appearance;
            return [frame.id, {
                name: getSkyTimeAnchor(frame)
                    ? `${tr(`lightflow_environment.gradient.${frame.phase}_sky_gradient`)} · ${formatSkyClockTime(frame.time)}`
                    : formatSkyClockTime(frame.time),
                detail: appearance ? `${tr('lightflow_environment.preview.coverage')} ${Math.round(appearance.cloud_coverage * 100)}%\n${tr('lightflow_environment.preview.opacity')} ${Math.round(appearance.cloud_opacity * 100)}%` : `${frame.time} ticks`,
                preview: appearance
                    ? `linear-gradient(90deg, ${appearance.cloud_top_color}, ${appearance.cloud_sun_side_color}, ${appearance.cloud_shadow_side_color}, ${appearance.cloud_bottom_color})`
                    : window.LightManagerUI.gradient.css(frame.gradient)
            }];
        }));
    }

    function refreshEnvironmentTimeGallery(dialog, frames, time) {
        const fields = dialog?.form?.form_data;
        if (!fields) return;
        for (const [id, option] of Object.entries(environmentTimeOptions(frames))) {
            fields.active_frame.updateOption(id, option);
            fields.active_frame.node.append(fields.active_frame.buttons.get(id));
        }
        fields.frame_time.setValue(time, false);
        fields.frame_clock.setValue(formatSkyClockTime(time));
    }

    function enhanceEnvironmentDialogForm(form) {
        if (!getEnvironmentFormUI()) return form;
        if (form.active_frame && form.add_time && form._add_frame) {
            // Keep the complete day visible; creation is a primary action, not a hidden group.
            const {active_frame, frame_time, add_time, _add_frame, _remove_frame, ...properties} = form;
            form = {
                active_frame,
                frame_clock: {type: 'text', label: 'lightflow_environment.field.frame_clock',
                    value: formatSkyClockTime(frame_time.value), placeholder: 'HH:MM',
                    description: frame_time.disable_desc || 'lightflow_environment.info.clock_input',
                    disable_condition: frame_time.disable_condition, disable_desc: frame_time.disable_desc},
                frame_time,
                add_time: {...add_time, type: 'text', value: formatSkyClockTime(add_time.value),
                    label: 'lightflow_environment.field.add_clock', placeholder: 'HH:MM',
                    description: 'lightflow_environment.info.clock_input'},
                _add_frame, _remove_frame,
                ...properties
            };
        }
        const enhanced = {};
        Object.entries(form).forEach(([key, original]) => {
            const section = ENVIRONMENT_DIALOG_SECTIONS[key];
            if (section) {
                enhanced[`environment_section${key}`] = {
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
                    options: getEnvironmentSelectOptions(key, original.options),
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
                const resetValue = Number.isFinite(original.reset_value)
                    ? original.reset_value
                    : DEFAULT_SETTINGS[key];
                enhanced[key] = {
                    ...original,
                    type: 'combo_slider',
                    resettable: Number.isFinite(resetValue),
                    reset_value: Number.isFinite(resetValue) ? resetValue : original.value
                };
                return;
            }
            if (original.type === 'buttons') {
                const text = original.buttons?.[0] || 'lightflow_environment.action.fit_shadow_region';
                enhanced[key] = {
                    ...original,
                    type: 'action_button',
                    text,
                    title: text,
                    icon: 'center_focus_strong',
                    background: 'var(--color-button)',
                    click: () => original.click?.(0)
                };
                return;
            }
            enhanced[key] = original;
        });
        return enhanced;
    }

    function addEnvironmentDialogStyles() {
        const style = Blockbench.addCSS(`
            #lightflow_environment_composer_dialog .dialog_content,
            #lightflow_environment_gradient_dialog .dialog_content {
                scrollbar-gutter: stable;
            }
            :is(#lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog) .form_bar_active_frame {
                height: auto !important; max-height: none !important;
            }
            :is(#lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog) .lf-grid-select {
                max-height: 192px; overflow-y: auto; padding: 3px;
                grid-template-columns: repeat(auto-fit, minmax(min(100%, 96px), 1fr));
            }
            :is(#lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog) .lf-grid-select > button { gap: 3px; padding: 6px; }
            :is(#lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog) .lf-grid-preview { height: 20px; }
            :is(#lightflow_environment_gradient_dialog, #lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog)
            :is([class*="form_bar_gradient_info"], [class*="form_bar__timeline_info"], [class*="form_bar__cloud_time_info"]) {
                height: auto !important;
                min-height: 0 !important;
                margin: 2px 0 12px !important;
                padding: 7px 8px !important;
                overflow: visible !important;
                align-items: flex-start !important;
                border-left: 3px solid color-mix(in srgb, var(--color-accent) 70%, transparent);
                background: color-mix(in srgb, var(--color-button) 42%, transparent);
                box-sizing: border-box;
            }
            :is(#lightflow_environment_gradient_dialog, #lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog)
            :is([class*="form_bar_gradient_info"], [class*="form_bar__timeline_info"], [class*="form_bar__cloud_time_info"]) .bar_display_paragraph {
                height: auto !important;
                min-height: 0 !important;
                padding: 0 2px !important;
                gap: 8px !important;
                align-items: flex-start !important;
                line-height: 1.35;
            }
            :is(#lightflow_environment_gradient_dialog, #lightflow_environment_time_gradient_dialog, #lightflow_environment_cloud_time_dialog)
            :is([class*="form_bar_gradient_info"], [class*="form_bar__timeline_info"], [class*="form_bar__cloud_time_info"]) .bar_display_content {
                white-space: normal !important;
                overflow-wrap: anywhere;
            }
            #lightflow_environment_gradient_dialog .light_manager_gradient_form_bar {
                margin: 0 0 10px !important;
            }
            #lightflow_environment_gradient_dialog .light_manager_gradient_form_bar:last-of-type {
                margin-bottom: 4px !important;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] {
                min-height: 34px;
                margin: 10px 0 4px;
                padding: 0 8px;
                border-left: 3px solid var(--color-accent);
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-ui) 84%, var(--color-back));
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"]:first-child {
                margin-top: 0;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] .bar_display {
                justify-content: flex-start;
                gap: 7px;
                font-weight: 600;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select,
            #lightflow_environment_composer_dialog .custom_checkbox {
                min-width: 0;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select:focus-visible,
            #lightflow_environment_composer_dialog .custom_checkbox:focus-visible,
            #lightflow_environment_composer_dialog .light_manager_action_button:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
            }
            #lightflow_environment_composer_dialog .custom_checkbox:hover,
            #lightflow_environment_composer_dialog .light_manager_action_button:hover {
                background: var(--color-button);
            }
            .lightflow_environment_sky_presets_menu {
                min-width: 270px;
                max-width: calc(100vw - 24px);
                overflow: visible;
            }
            .lightflow_environment_sky_presets_menu > li.hybrid_parent {
                position: relative;
                padding-right: 38px;
            }
            .lightflow_environment_sky_presets_menu > li.hybrid_parent > .menu_more_button {
                position: absolute;
                right: 0;
                top: 0;
                bottom: 0;
                width: 36px;
                height: auto;
                margin: 0;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        `);
        deletables.push(style);
    }

    function createDialogForm() {
        const textureOptions = getTextureOptions();
        const shadowFrustum = getActiveShadowFrustum();
        const presetGradients = getPresetSkyGradientProfiles();
        const form = {
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            dimension: { type:'select', label:'lightflow_environment.field.dimension', value:settings.dimension,
                options:{overworld:'Overworld',nether:'Nether',crimson_forest:'Crimson Forest',warped_forest:'Warped Forest',soulsand_valley:'Soul Sand Valley',basalt_deltas:'Basalt Deltas',end:'The End'} },
            dimension_fog_mode: { type:'select', label:'lightflow_environment.field.dimension_fog_mode', value:settings.dimension_fog_mode,
                options:{preset:'lightflow_environment.option.dimension_fog_preset',custom:'lightflow_environment.option.palette_custom'},condition:form=>form.dimension!=='overworld' },
            sky_cycle_mode: { type:'select', label:'lightflow_environment.field.sky_cycle_mode', value:settings.sky_cycle_mode,
                options:{reference:'lightflow_environment.option.cycle_reference',legacy:'lightflow_environment.option.cycle_legacy'},
                condition:form=>form.dimension==='overworld' && form.palette_mode!=='custom' },
            _time: '_',
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100,
                marks: [
                    {value: 6000, label: 'lightflow_environment.time.noon', icon: 'light_mode'},
                    {value: 12000, label: 'lightflow_environment.time.sunset', icon: 'wb_twilight'},
                    {value: 18000, label: 'lightflow_environment.time.midnight', icon: 'dark_mode'},
                    {value: 23000, label: 'lightflow_environment.time.sunrise', icon: 'wb_twilight'}
                ] },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            day_length_seconds: { type: 'number', label: 'lightflow_environment.field.day_length', value: settings.day_length_seconds, min: 10, max: 3600, step: 10, condition: form => !!form.animate_time },
            sun_azimuth: { type: 'range', label: 'lightflow_environment.field.azimuth', value: settings.sun_azimuth, min: 0, max: 360, step: 1, unit: '°',
                marks: [0,90,180,270,360].map(value => ({value, label: `${value}°`})) },
            _sky_colors: '_',
            palette_mode: { type: 'select', label: 'lightflow_environment.field.palette_mode', value: settings.palette_mode,
                options: { preset: 'lightflow_environment.option.palette_preset', custom: 'lightflow_environment.option.palette_custom' } },
            _sky_gradient_editor: {
                type: 'action_button', semantic_button: true, icon: 'gradient',
                text: 'lightflow_environment.action.edit_gradients',
                description: 'lightflow_environment.gradient.info',
                condition: form => form.palette_mode === 'custom' && !form.sky_time_gradients_enabled,
                click: () => {
                    const active = ['day_sky_gradient', 'sunrise_sky_gradient', 'sunset_sky_gradient', 'night_sky_gradient'].find(key => environmentPanel?.form?.form_data[key]?.node?.classList.contains('editing'));
                    openSkyGradientDialog(active || 'day_sky_gradient');
                }
            },
            sky_time_gradients_enabled: {
                type: 'checkbox', label: 'lightflow_environment.field.sky_time_gradients_enabled',
                description: 'lightflow_environment.info.sky_time_gradients',
                value: settings.sky_time_gradients_enabled,
                condition: form => form.palette_mode === 'custom' && form.dimension === 'overworld' && settings.sky_time_gradients.length >= 2
            },
            _sky_time_gradient_editor: {
                type: 'action_button', semantic_button: true, icon: 'schedule',
                text: 'lightflow_environment.action.edit_timed_gradients',
                description: 'lightflow_environment.info.sky_time_gradients',
                condition: form => form.palette_mode === 'custom' && form.dimension === 'overworld',
                click: () => openSkyTimeGradientDialog()
            },
            day_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.day_sky_gradient',
                description: 'lightflow_environment.field.day_sky_gradient.desc', icon: 'light_mode',
                value: settings.day_sky_gradient, default: presetGradients.day,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(0, 'pastel', '#A2EBFF'),
                condition: form => form.palette_mode === 'custom' && !form.sky_time_gradients_enabled
            },
            sunrise_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunrise_sky_gradient',
                description: 'lightflow_environment.field.sunrise_sky_gradient.desc', icon: 'wb_twilight',
                value: settings.sunrise_sky_gradient, default: presetGradients.sunrise,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(2, 'pastel', '#F1BB75'),
                condition: form => form.palette_mode === 'custom' && !form.sky_time_gradients_enabled
            },
            sunset_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunset_sky_gradient',
                description: 'lightflow_environment.field.sunset_sky_gradient.desc', icon: 'wb_twilight',
                value: settings.sunset_sky_gradient || settings.sunrise_sky_gradient, default: presetGradients.sunset,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(3, 'pastel', '#FFAA87'),
                condition: form => form.palette_mode === 'custom' && !form.sky_time_gradients_enabled
            },
            night_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.night_sky_gradient',
                description: 'lightflow_environment.field.night_sky_gradient.desc', icon: 'nights_stay',
                value: settings.night_sky_gradient, default: presetGradients.night,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(4, 'pastel', '#C5A6E8'),
                condition: form => form.palette_mode === 'custom' && !form.sky_time_gradients_enabled
            },
            sun_color: { type: 'color', label: 'lightflow_environment.field.sun_color', value: settings.sun_color, condition: form => form.palette_mode === 'custom' },
            moon_color: { type: 'color', label: 'lightflow_environment.field.moon_color', value: settings.moon_color, condition: form => form.palette_mode === 'custom' },
            cloud_color: { type: 'color', label: 'lightflow_environment.field.cloud_color', value: settings.cloud_color, condition: form => form.palette_mode === 'custom' },
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            sky_gradient_power: { type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power, min: 0.5, max: 8, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            ambient_fill_color_mode: { type: 'select', label: 'lightflow_environment.field.ambient_fill_color_mode', value: settings.ambient_fill_color_mode,
                options: { sky: 'lightflow_environment.option.ambient_fill_sky', custom: 'lightflow_environment.option.ambient_fill_custom' } },
            ambient_fill_shape: { type: 'select', label: 'lightflow_environment.field.ambient_fill_shape', value: settings.ambient_fill_shape,
                options: { preset: 'lightflow_environment.option.ambient_fill_preset', flat: 'lightflow_environment.option.ambient_fill_flat', hemisphere: 'lightflow_environment.option.ambient_fill_hemisphere' } },
            ambient_fill_sky_color: { type: 'color', label: 'lightflow_environment.field.ambient_fill_sky_color', value: settings.ambient_fill_sky_color,
                condition: form => form.ambient_fill_color_mode === 'custom' },
            ambient_fill_ground_color: { type: 'color', label: 'lightflow_environment.field.ambient_fill_ground_color', value: settings.ambient_fill_ground_color,
                condition: form => form.ambient_fill_color_mode === 'custom' && form.ambient_fill_shape !== 'flat' },
            ambient_fill_day_multiplier: { type: 'range', label: 'lightflow_environment.field.ambient_fill_day_multiplier', value: settings.ambient_fill_day_multiplier, min: 0, max: 4, step: 0.05 },
            ambient_fill_night_multiplier: { type: 'range', label: 'lightflow_environment.field.ambient_fill_night_multiplier', value: settings.ambient_fill_night_multiplier, min: 0, max: 4, step: 0.05 },
            _fog: '_',
            distance_look_presets: { type: 'action_button', semantic_button: true, icon: 'tune',
                text: 'lightflow_environment.action.distance_looks', description: 'lightflow_environment.info.distance_looks', click: openDistanceLookMenu },
            distance_fog_enabled: { type: 'checkbox', label: 'lightflow_environment.field.distance_fog_enabled', value: settings.distance_fog_enabled,
                description: 'lightflow_environment.info.distance_fog_art' },
            distance_fog_color_mode: { type: 'select', label: 'lightflow_environment.field.distance_fog_color_mode', value: settings.distance_fog_color_mode,
                options: { sky: 'lightflow_environment.option.fog_color_sky', time: 'lightflow_environment.option.fog_color_time', fixed: 'lightflow_environment.option.fog_color_fixed' },
                condition: form => !!form.distance_fog_enabled },
            distance_fog_fixed_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_fixed_color', value: settings.distance_fog_fixed_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'fixed' },
            distance_fog_day_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_day_color', value: settings.distance_fog_day_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_sunrise_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_sunrise_color', value: settings.distance_fog_sunrise_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_night_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_night_color', value: settings.distance_fog_night_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_near_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_near_color', value: settings.distance_fog_near_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_gradient > 0 },
            distance_fog_start: { type: 'number', label: 'lightflow_environment.field.distance_fog_start', value: settings.distance_fog_start, min: 0, step: 1,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_end: { type: 'number', label: 'lightflow_environment.field.distance_fog_end', value: settings.distance_fog_end, min: 0.001, step: 1,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_smoothness: { type: 'range', label: 'lightflow_environment.field.distance_fog_smoothness', value: settings.distance_fog_smoothness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_curve: { type: 'range', label: 'lightflow_environment.field.distance_fog_curve', description: 'lightflow_environment.info.distance_curve', value: settings.distance_fog_curve, min: 0.25, max: 4, step: 0.05,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_sky_blend: { type: 'range', label: 'lightflow_environment.field.distance_fog_sky_blend', description: 'lightflow_environment.info.distance_sky_blend', value: settings.distance_fog_sky_blend, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled && form.dimension === 'overworld' },
            distance_fog_gradient: { type: 'range', label: 'lightflow_environment.field.distance_fog_gradient', value: settings.distance_fog_gradient, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_max_opacity: { type: 'range', label: 'lightflow_environment.field.distance_fog_max_opacity', value: settings.distance_fog_max_opacity, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_sync_background: { type: 'checkbox', label: 'lightflow_environment.field.distance_fog_sync_background', value: settings.distance_fog_sync_background,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_noise: { type: 'range', label: 'lightflow_environment.field.distance_fog_noise', description: 'lightflow_environment.info.distance_noise', value: settings.distance_fog_noise, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_noise_scale: { type: 'number', label: 'lightflow_environment.field.distance_fog_noise_scale', value: settings.distance_fog_noise_scale, min: 0.25, max: 4096, step: 1,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_noise > 0 },
            distance_fog_dither: { type: 'range', label: 'lightflow_environment.field.distance_fog_dither', value: settings.distance_fog_dither, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_grade_enabled: { type: 'checkbox', label: 'lightflow_environment.field.distance_grade_enabled', value: settings.distance_grade_enabled },
            distance_grade_follow_fog: { type: 'checkbox', label: 'lightflow_environment.field.distance_grade_follow_fog', description: 'lightflow_environment.info.distance_grade_range', value: settings.distance_grade_follow_fog,
                condition: form => !!form.distance_grade_enabled },
            distance_grade_start: { type: 'number', label: 'lightflow_environment.field.distance_grade_start', value: settings.distance_grade_start, min: 0,
                condition: form => !!form.distance_grade_enabled && !form.distance_grade_follow_fog },
            distance_grade_end: { type: 'number', label: 'lightflow_environment.field.distance_grade_end', value: settings.distance_grade_end, min: 0.001,
                condition: form => !!form.distance_grade_enabled && !form.distance_grade_follow_fog },
            distance_grade_curve: { type: 'range', label: 'lightflow_environment.field.distance_grade_curve', description: 'lightflow_environment.info.distance_curve', value: settings.distance_grade_curve, min: 0.25, max: 4, step: 0.05,
                condition: form => !!form.distance_grade_enabled },
            distance_grade_saturation: { type: 'range', label: 'lightflow_environment.field.distance_grade_saturation', value: settings.distance_grade_saturation, min: 0, max: 2, step: 0.01,
                condition: form => !!form.distance_grade_enabled },
            distance_grade_contrast: { type: 'range', label: 'lightflow_environment.field.distance_grade_contrast', value: settings.distance_grade_contrast, min: 0, max: 2, step: 0.01,
                condition: form => !!form.distance_grade_enabled },
            distance_grade_pivot_mode: { type: 'select', label: 'lightflow_environment.field.distance_grade_pivot_mode', value: settings.distance_grade_pivot_mode,
                options: { fixed: 'lightflow_environment.option.fog_color_fixed', sky: 'lightflow_environment.option.fog_color_sky' }, condition: form => !!form.distance_grade_enabled },
            distance_grade_pivot: { type: 'range', label: 'lightflow_environment.field.distance_grade_pivot', description: 'lightflow_environment.info.distance_pivot', value: settings.distance_grade_pivot, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_grade_enabled && form.distance_grade_pivot_mode !== 'sky' },
            distance_grade_tint_mode: { type: 'select', label: 'lightflow_environment.field.distance_grade_tint_mode', value: settings.distance_grade_tint_mode,
                options: { fixed: 'lightflow_environment.option.fog_color_fixed', sky: 'lightflow_environment.option.fog_color_sky' }, condition: form => !!form.distance_grade_enabled },
            distance_grade_tint: { type: 'color', label: 'lightflow_environment.field.distance_grade_tint', value: settings.distance_grade_tint,
                condition: form => !!form.distance_grade_enabled && form.distance_grade_tint_mode !== 'sky' },
            distance_grade_tint_strength: { type: 'range', label: 'lightflow_environment.field.distance_grade_tint_strength', value: settings.distance_grade_tint_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_grade_enabled },
            _celestial: '_',
            sun_enabled: { type: 'checkbox', label: 'lightflow_environment.field.sun_enabled', value: settings.sun_enabled },
            sun_intensity: { type: 'range', label: 'lightflow_environment.field.sun_intensity', value: settings.sun_intensity, min: 0, max: 10, step: 0.05, condition: form => !!form.sun_enabled },
            sun_light_color_mode: { type: 'select', label: 'lightflow_environment.field.sun_light_color_mode', value: settings.sun_light_color_mode,
                options: { sun: 'lightflow_environment.option.sun_light_follow_disc', time: 'lightflow_environment.option.sun_light_time_colors' },
                condition: form => !!form.sun_enabled },
            sun_light_day_color: { type: 'color', label: 'lightflow_environment.field.sun_light_day_color', value: settings.sun_light_day_color,
                condition: form => !!form.sun_enabled && form.sun_light_color_mode === 'time' },
            sun_light_twilight_color: { type: 'color', label: 'lightflow_environment.field.sun_light_twilight_color', value: settings.sun_light_twilight_color,
                condition: form => !!form.sun_enabled && form.sun_light_color_mode === 'time' },
            moon_intensity: { type: 'range', label: 'lightflow_environment.field.moon_intensity', value: settings.moon_intensity, min: 0, max: 2, step: 0.02, condition: form => !!form.sun_enabled },
            moon_light_color_mode: { type: 'select', label: 'lightflow_environment.field.moon_light_color_mode', value: settings.moon_light_color_mode,
                options: { moon: 'lightflow_environment.option.moon_light_follow_disc', custom: 'lightflow_environment.option.moon_light_custom' },
                condition: form => !!form.sun_enabled },
            moon_light_custom_color: { type: 'color', label: 'lightflow_environment.field.moon_light_custom_color', value: settings.moon_light_custom_color,
                condition: form => !!form.sun_enabled && form.moon_light_color_mode === 'custom' },
            celestial_size: { type: 'range', label: 'lightflow_environment.field.celestial_size', value: settings.celestial_size, min: 0.012, max: 0.5, step: 0.002 },
            moon_size: { type:'range', label:'lightflow_environment.field.moon_size', value:settings.moon_size, min:0.012,max:0.5,step:0.002 },
            moon_phase: { type: 'select', label: 'lightflow_environment.field.moon_phase', value: String(settings.moon_phase),
                options: {
                    '0': 'lightflow_environment.option.moon_full',
                    '1': 'lightflow_environment.option.moon_waning_gibbous',
                    '2': 'lightflow_environment.option.moon_third_quarter',
                    '3': 'lightflow_environment.option.moon_waning_crescent',
                    '4': 'lightflow_environment.option.moon_new',
                    '5': 'lightflow_environment.option.moon_waxing_crescent',
                    '6': 'lightflow_environment.option.moon_first_quarter',
                    '7': 'lightflow_environment.option.moon_waxing_gibbous'
                } },
            sun_mode: { type: 'select', label: 'lightflow_environment.field.sun_mode', value: settings.sun_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            sun_blend_mode: { type: 'select', label: 'lightflow_environment.field.sun_blend_mode', value: settings.sun_blend_mode,
                options: { preset: 'lightflow_environment.option.celestial_blend_preset', alpha: 'lightflow_environment.option.celestial_blend_alpha', additive: 'lightflow_environment.option.celestial_blend_additive', multiply: 'lightflow_environment.option.celestial_blend_multiply' },
                condition: form => form.sun_mode !== 'hidden' },
            sun_opacity: { type: 'range', label: 'lightflow_environment.field.sun_opacity', value: settings.sun_opacity, min: 0, max: 1, step: 0.01,
                condition: form => form.sun_mode !== 'hidden' },
            sun_texture_uuid: { type: 'select', label: 'lightflow_environment.field.sun_texture', value: settings.sun_texture_uuid,
                options: textureOptions, condition: form => form.sun_mode === 'texture' },
            moon_mode: { type: 'select', label: 'lightflow_environment.field.moon_mode', value: settings.moon_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            moon_blend_mode: { type: 'select', label: 'lightflow_environment.field.moon_blend_mode', value: settings.moon_blend_mode,
                options: { preset: 'lightflow_environment.option.celestial_blend_preset', alpha: 'lightflow_environment.option.celestial_blend_alpha', additive: 'lightflow_environment.option.celestial_blend_additive', multiply: 'lightflow_environment.option.celestial_blend_multiply' },
                condition: form => form.moon_mode !== 'hidden' },
            moon_opacity: { type: 'range', label: 'lightflow_environment.field.moon_opacity', value: settings.moon_opacity, min: 0, max: 1, step: 0.01,
                condition: form => form.moon_mode !== 'hidden' },
            moon_texture_uuid: { type: 'select', label: 'lightflow_environment.field.moon_texture', value: settings.moon_texture_uuid,
                options: textureOptions, condition: form => form.moon_mode === 'texture' },
            moon_texture_layout: { type: 'select', label: 'lightflow_environment.field.moon_texture_layout', value: settings.moon_texture_layout,
                options: { atlas: 'lightflow_environment.option.moon_atlas', single: 'lightflow_environment.option.moon_single' }, condition: form => form.moon_mode === 'texture' },
            moon_atlas_columns: { type: 'number', label: 'lightflow_environment.field.moon_atlas_columns', value: settings.moon_atlas_columns, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_atlas_rows: { type: 'number', label: 'lightflow_environment.field.moon_atlas_rows', value: settings.moon_atlas_rows, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_phase_offset: { type: 'number', label: 'lightflow_environment.field.moon_phase_offset', value: settings.moon_phase_offset, min: -64, max: 64, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            sun_horizon_scale: { type: 'range', label: 'lightflow_environment.field.sun_horizon_scale', value: settings.sun_horizon_scale, min: 1, max: 2.5, step: 0.01 },
            sun_gaze_scale: { type: 'range', label: 'lightflow_environment.field.sun_gaze_scale', value: settings.sun_gaze_scale, min: 1, max: 2.5, step: 0.01 },
            sun_glare: { type: 'range', label: 'lightflow_environment.field.sun_glare', value: settings.sun_glare, min: 0, max: 3, step: 0.02 },
            lens_flare_enabled: { type:'checkbox', label:'lightflow_environment.field.lens_flare_enabled', value:settings.lens_flare_enabled },
            lens_flare_strength: { type:'range', label:'lightflow_environment.field.lens_flare_strength', value:settings.lens_flare_strength, min:0, max:2, step:.02, condition:form=>!!form.lens_flare_enabled },
            lens_flare_scale: { type:'range', label:'lightflow_environment.field.lens_flare_scale', value:settings.lens_flare_scale, min:.25, max:3, step:.05, condition:form=>!!form.lens_flare_enabled },
            sunset_directional_glow: { type: 'range', label: 'lightflow_environment.field.sunset_directional_glow', value: settings.sunset_directional_glow, min: 0, max: 3, step: 0.02 },
            _sky: '_',
            stars_enabled: { type: 'checkbox', label: 'lightflow_environment.field.stars', value: settings.stars_enabled },
            star_brightness: { type: 'range', label: 'lightflow_environment.field.star_brightness', value: settings.star_brightness, min: 0, max: 3, step: 0.05, condition: form => !!form.stars_enabled },
            star_density: { type: 'range', label: 'lightflow_environment.field.star_density', value: settings.star_density, min: 0.1, max: 4, step: 0.05, condition: form => !!form.stars_enabled },
            clouds_enabled: { type: 'checkbox', label: 'lightflow_environment.field.clouds', value: settings.clouds_enabled },
            cloud_time_profiles_enabled: {
                type: 'checkbox', label: 'lightflow_environment.field.cloud_time_profiles_enabled',
                value: settings.cloud_time_profiles_enabled,
                condition: form => !!form.clouds_enabled && form.dimension === 'overworld' && settings.cloud_time_profiles.length >= 2
            },
            _cloud_time_profiles_editor: {
                type: 'action_button', semantic_button: true, icon: 'schedule',
                text: 'lightflow_environment.action.cloud_time_profiles',
                description: 'lightflow_environment.info.cloud_time_profiles',
                condition: form => !!form.clouds_enabled && form.dimension === 'overworld',
                click: () => openCloudTimeProfilesDialog()
            },
            cloud_mode: { type: 'select', label: 'lightflow_environment.field.cloud_mode', value: settings.cloud_mode,
                options: { procedural: 'lightflow_environment.option.cloud_procedural', vanilla: 'lightflow_environment.option.cloud_vanilla', texture: 'lightflow_environment.option.cloud_texture' }, condition: form => !!form.clouds_enabled },
            cloud_style: { type: 'select', label: 'lightflow_environment.field.cloud_style', value: settings.cloud_style,
                options: { vanilla: 'lightflow_environment.option.cloud_style_vanilla', rendercraft: 'lightflow_environment.option.cloud_style_rendercraft', vibrant_visuals: 'lightflow_environment.option.cloud_style_vibrant' }, condition: form => !!form.clouds_enabled },
            cloud_palette_mode: { type: 'select', label: 'lightflow_environment.field.cloud_palette_mode', value: settings.cloud_palette_mode,
                options: { preset: 'lightflow_environment.option.cloud_palette_preset', custom: 'lightflow_environment.option.cloud_palette_custom' },
                condition: form => !!form.clouds_enabled },
            cloud_texture_uuid: { type: 'select', label: 'lightflow_environment.field.cloud_texture', value: settings.cloud_texture_uuid,
                options: textureOptions, condition: form => !!form.clouds_enabled && form.cloud_mode === 'texture' },
            cloud_coverage: { type: 'range', label: 'lightflow_environment.field.cloud_coverage', value: settings.cloud_coverage, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_opacity: { type: 'range', label: 'lightflow_environment.field.cloud_opacity', value: settings.cloud_opacity, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_speed: { type: 'range', label: 'lightflow_environment.field.cloud_speed', value: settings.cloud_speed, min: -0.2, max: 0.2, step: 0.002, condition: form => !!form.clouds_enabled },
            cloud_paused: { type: 'checkbox', label: 'lightflow_environment.field.cloud_paused', value: settings.cloud_paused, condition: form => !!form.clouds_enabled },
            cloud_offset_x: { type: 'range', label: 'lightflow_environment.field.cloud_offset_x', value: settings.cloud_offset_x, min: -1024, max: 1024, step: 0.25, condition: form => !!form.clouds_enabled },
            cloud_offset_y: { type: 'range', label: 'lightflow_environment.field.cloud_offset_y', value: settings.cloud_offset_y, min: -1024, max: 1024, step: 0.25, condition: form => !!form.clouds_enabled },
            cloud_scale: { type: 'range', label: 'lightflow_environment.field.cloud_scale', value: settings.cloud_scale, min: 0.05, max: 16, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_direction: { type: 'range', label: 'lightflow_environment.field.cloud_direction', value: settings.cloud_direction, min: 0, max: 360, step: 1, condition: form => !!form.clouds_enabled, unit: '°',
                marks: [0,90,180,270,360].map(value => ({value, label: `${value}°`})) },
            cloud_contrast: { type: 'range', label: 'lightflow_environment.field.cloud_contrast', value: settings.cloud_contrast, min: 0.1, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_brightness: { type: 'range', label: 'lightflow_environment.field.cloud_brightness', value: settings.cloud_brightness, min: 0, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_height: { type: 'range', label: 'lightflow_environment.field.cloud_height', value: settings.cloud_height, min: 8, max: 512, step: 1, condition: form => !!form.clouds_enabled },
            cloud_thickness: { type: 'range', label: 'lightflow_environment.field.cloud_thickness', value: settings.cloud_thickness, min: 0.25, max: 64, step: 0.25, condition: form => !!form.clouds_enabled },
            cloud_extrusion: { type: 'range', label: 'lightflow_environment.field.cloud_extrusion', value: settings.cloud_extrusion, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_top_color: { type: 'color', label: 'lightflow_environment.field.cloud_top_color', value: settings.cloud_top_color,
                condition: form => !!form.clouds_enabled && form.cloud_palette_mode === 'custom' },
            cloud_sun_side_color: { type: 'color', label: 'lightflow_environment.field.cloud_sun_side_color', value: settings.cloud_sun_side_color,
                condition: form => !!form.clouds_enabled && form.cloud_palette_mode === 'custom' },
            cloud_shadow_side_color: { type: 'color', label: 'lightflow_environment.field.cloud_shadow_side_color', value: settings.cloud_shadow_side_color,
                condition: form => !!form.clouds_enabled && form.cloud_palette_mode === 'custom' },
            cloud_bottom_color: { type: 'color', label: 'lightflow_environment.field.cloud_bottom_color', value: settings.cloud_bottom_color,
                condition: form => !!form.clouds_enabled && form.cloud_palette_mode === 'custom' },
            cloud_edge_color: { type: 'color', label: 'lightflow_environment.field.cloud_edge_color', value: settings.cloud_edge_color,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_palette_mode === 'custom' },
            cloud_shadow_bevel_color: { type: 'color', label: 'lightflow_environment.field.cloud_shadow_bevel_color', value: settings.cloud_shadow_bevel_color,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false && form.cloud_palette_mode === 'custom' },
            cloud_bevel_enabled: { type: 'checkbox', label: 'lightflow_environment.field.cloud_bevel_enabled', value: settings.cloud_bevel_enabled,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' },
            cloud_scattering_strength: { type: 'range', label: 'lightflow_environment.field.cloud_scattering_strength', description: 'lightflow_environment.info.cloud_scattering_strength', value: settings.cloud_scattering_strength, reset_value: DEFAULT_SETTINGS.cloud_scattering_strength, min: 0, max: 3, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_gradient_thickness: { type: 'range', label: 'lightflow_environment.field.cloud_gradient_thickness', description: 'lightflow_environment.info.cloud_gradient_thickness', value: settings.cloud_gradient_thickness, reset_value: DEFAULT_SETTINGS.cloud_gradient_thickness, min: 0, max: 8, step: 0.05,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_gradient_alpha: { type: 'range', label: 'lightflow_environment.field.cloud_gradient_alpha', description: 'lightflow_environment.info.cloud_gradient_alpha', value: settings.cloud_gradient_alpha, reset_value: DEFAULT_SETTINGS.cloud_gradient_alpha, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_view_response: { type: 'range', label: 'lightflow_environment.field.cloud_view_response', description: 'lightflow_environment.info.cloud_view_response', value: settings.cloud_view_response, reset_value: DEFAULT_SETTINGS.cloud_view_response, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_edge_hardness: { type: 'range', label: 'lightflow_environment.field.cloud_edge_hardness', description: 'lightflow_environment.info.cloud_edge_hardness', value: settings.cloud_edge_hardness, reset_value: DEFAULT_SETTINGS.cloud_edge_hardness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_scattering_size: { type: 'range', label: 'lightflow_environment.field.cloud_scattering_size', description: 'lightflow_environment.info.cloud_scattering_size', value: settings.cloud_scattering_size, reset_value: DEFAULT_SETTINGS.cloud_scattering_size, min: 0.1, max: 4, step: 0.05,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_optical_thickness: { type: 'range', label: 'lightflow_environment.field.cloud_optical_thickness', description: 'lightflow_environment.info.cloud_optical_thickness', value: settings.cloud_optical_thickness, reset_value: DEFAULT_SETTINGS.cloud_optical_thickness, min: 0.05, max: 4, step: 0.05,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_phase_anisotropy: { type: 'range', label: 'lightflow_environment.field.cloud_phase_anisotropy', description: 'lightflow_environment.info.cloud_phase_anisotropy', value: settings.cloud_phase_anisotropy, reset_value: DEFAULT_SETTINGS.cloud_phase_anisotropy, min: 0, max: 0.85, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_density_variation: { type: 'range', label: 'lightflow_environment.field.cloud_density_variation', description: 'lightflow_environment.info.cloud_density_variation', value: settings.cloud_density_variation, reset_value: DEFAULT_SETTINGS.cloud_density_variation, min: 0, max: 0.3, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'vibrant_visuals' },
            cloud_bevel_width: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_width', value: settings.cloud_bevel_width, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.width, min: 0, max: 0.45, step: 0.005,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_bevel_smooth: { type: 'checkbox', label: 'lightflow_environment.field.cloud_bevel_smooth', value: settings.cloud_bevel_smooth,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_bevel_softness: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_softness', value: settings.cloud_bevel_softness, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.softness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false && !!form.cloud_bevel_smooth },
            cloud_bevel_roundness: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_roundness', value: settings.cloud_bevel_roundness, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.roundness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_bevel_strength: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_strength', value: settings.cloud_bevel_strength, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_bevel_distance_fade: { type: 'checkbox', label: 'lightflow_environment.field.cloud_bevel_distance_fade', value: settings.cloud_bevel_distance_fade,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_bevel_distance_min_scale: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_distance_min_scale', value: settings.cloud_bevel_distance_min_scale, min: 0.02, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false && !!form.cloud_bevel_distance_fade },
            cloud_edge_strength: { type: 'range', label: 'lightflow_environment.field.cloud_edge_strength', value: settings.cloud_edge_strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' },
            cloud_shadow_bevel_strength: { type: 'range', label: 'lightflow_environment.field.cloud_shadow_bevel_strength', value: settings.cloud_shadow_bevel_strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' && form.cloud_bevel_enabled !== false },
            cloud_environment_influence: { type: 'range', label: 'lightflow_environment.field.cloud_environment_influence',
                description: 'lightflow_environment.info.cloud_environment_influence', value: settings.cloud_environment_influence,
                min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_time_tint_strength: { type: 'range', label: 'lightflow_environment.field.cloud_time_tint_strength',
                description: 'lightflow_environment.info.cloud_time_tint_strength', value: settings.cloud_time_tint_strength,
                min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_lighting_mode: { type: 'select', label: 'lightflow_environment.field.cloud_lighting_mode', value: settings.cloud_lighting_mode,
                options: { palette: 'lightflow_environment.option.cloud_lighting_palette', sky: 'lightflow_environment.option.cloud_lighting_sky', mixed: 'lightflow_environment.option.cloud_lighting_mixed' },
                condition: form => !!form.clouds_enabled && (form.cloud_style !== 'vanilla' || form.cloud_palette_mode === 'custom' || form.cloud_time_profiles_enabled) },
            cloud_sky_tint_strength: { type: 'range', label: 'lightflow_environment.field.cloud_sky_tint_strength', value: settings.cloud_sky_tint_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && (form.cloud_style !== 'vanilla' || form.cloud_palette_mode === 'custom' || form.cloud_time_profiles_enabled) && form.cloud_lighting_mode !== 'palette' },
            cloud_sun_tint_strength: { type: 'range', label: 'lightflow_environment.field.cloud_sun_tint_strength', value: settings.cloud_sun_tint_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && (form.cloud_style !== 'vanilla' || form.cloud_palette_mode === 'custom' || form.cloud_time_profiles_enabled) },
            cloud_fog_enabled: { type: 'checkbox', label: 'lightflow_environment.field.cloud_fog_enabled', value: settings.cloud_fog_enabled,
                condition: form => !!form.clouds_enabled },
            cloud_fog_color_mode: { type: 'select', label: 'lightflow_environment.field.cloud_fog_color_mode', value: settings.cloud_fog_color_mode,
                options: { sky: 'lightflow_environment.option.cloud_fog_sky', custom: 'lightflow_environment.option.cloud_fog_custom' },
                condition: form => !!form.clouds_enabled && !!form.cloud_fog_enabled },
            cloud_fog_color: { type: 'color', label: 'lightflow_environment.field.cloud_fog_color', value: settings.cloud_fog_color,
                condition: form => !!form.clouds_enabled && !!form.cloud_fog_enabled && form.cloud_fog_color_mode === 'custom' },
            cloud_fog_strength: { type: 'range', label: 'lightflow_environment.field.cloud_fog_strength', value: settings.cloud_fog_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && !!form.cloud_fog_enabled },
            cloud_fog_start: { type: 'range', label: 'lightflow_environment.field.cloud_fog_start', value: settings.cloud_fog_start, min: 0, max: 0.98, step: 0.01,
                condition: form => !!form.clouds_enabled && !!form.cloud_fog_enabled },
            cloud_fog_end: { type: 'range', label: 'lightflow_environment.field.cloud_fog_end', value: settings.cloud_fog_end, min: 0.01, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && !!form.cloud_fog_enabled },
            cloud_density: { type: 'range', label: 'lightflow_environment.field.cloud_density', value: settings.cloud_density, min: 0.05, max: 4, step: 0.05,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' },
            cloud_absorption: { type: 'range', label: 'lightflow_environment.field.cloud_absorption', value: settings.cloud_absorption, min: 0, max: 3, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style !== 'vanilla' },
            cloud_translucency: { type:'range', label:'lightflow_environment.field.cloud_translucency', value:settings.cloud_translucency, min:0, max:1, step:.02, condition:form=>!!form.clouds_enabled },
            _bloom: '_',
            environment_bloom_enabled: { type: 'checkbox', label: 'lightflow_environment.field.environment_bloom_enabled', value: settings.environment_bloom_enabled },
            bloom_threshold: { type: 'range', label: 'lightflow_environment.field.bloom_threshold', value: settings.bloom_threshold, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_soft_knee: { type: 'range', label: 'lightflow_environment.field.bloom_soft_knee', value: settings.bloom_soft_knee, min: 0, max: 1, step: 0.01, condition: form => !!form.environment_bloom_enabled },
            bloom_strength: { type: 'range', label: 'lightflow_environment.field.bloom_strength', value: settings.bloom_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_core_strength: { type: 'range', label: 'lightflow_environment.field.bloom_core_strength', value: settings.bloom_core_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_core_radius: { type: 'range', label: 'lightflow_environment.field.bloom_core_radius', value: settings.bloom_core_radius, min: 0.25, max: 8, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_halo_strength: { type: 'range', label: 'lightflow_environment.field.bloom_halo_strength', value: settings.bloom_halo_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_halo_radius: { type: 'range', label: 'lightflow_environment.field.bloom_halo_radius', value: settings.bloom_halo_radius, min: 1, max: 64, step: 0.5, condition: form => !!form.environment_bloom_enabled },
            bloom_hdr_strength: { type: 'range', label: 'lightflow_environment.field.bloom_hdr_strength', value: settings.bloom_hdr_strength, min: 0, max: 6, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_emissive_strength: { type: 'range', label: 'lightflow_environment.field.bloom_emissive_strength', value: settings.bloom_emissive_strength, min: 0, max: 6, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_occlusion: { type: 'range', label: 'lightflow_environment.field.bloom_occlusion', value: settings.bloom_occlusion, min: 0, max: 1, step: 0.01, condition: form => !!form.environment_bloom_enabled },
            sun_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.sun_bloom_contribution', value: settings.sun_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            moon_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.moon_bloom_contribution', value: settings.moon_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            star_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.star_bloom_contribution', value: settings.star_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            cloud_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.cloud_bloom_contribution', value: settings.cloud_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            _shadows: '_',
            sun_cast_shadows: { type: 'checkbox', label: 'lightflow_environment.field.cast_shadows', value: settings.sun_cast_shadows, condition: form => !!form.sun_enabled },
            fit_shadow_region: {
                type: 'buttons',
                buttons: ['lightflow_environment.action.fit_shadow_region'],
                click: fitEnvironmentShadowRegion,
                condition: form => !!form.sun_cast_shadows
            },
            shadow_auto_fit: { type: 'checkbox', label: 'lightflow_environment.field.shadow_auto_fit', value: settings.shadow_auto_fit, condition: form => !!form.sun_cast_shadows },
            shadow_scene_fit: { type: 'checkbox', label: 'lightflow_environment.field.shadow_scene_fit', value: settings.shadow_scene_fit, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            shadow_region_locked: { type: 'checkbox', label: 'lightflow_environment.field.shadow_region_locked', value: settings.shadow_region_locked, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            show_shadow_gizmo: { type: 'checkbox', label: 'lightflow_environment.field.show_shadow_gizmo', value: settings.show_shadow_gizmo, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            shadow_area: { type: 'number', label: 'lightflow_environment.field.shadow_area', value: shadowFrustum.area, min: 2, max: 100000, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_resolution: { type: 'select', label: 'lightflow_environment.field.shadow_resolution', value: String(settings.shadow_resolution),
                options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096', '8192': '8192' }, condition: form => !!form.sun_cast_shadows },
            studio_shadow_resolution: {
                type: 'select', label: 'lightflow_environment.field.studio_shadow_resolution',
                description: 'lightflow_environment.field.studio_shadow_resolution.desc',
                value: String(settings.studio_shadow_resolution),
                options: {
                    '0': 'lightflow_environment.option.studio_shadow.same',
                    '256': '256', '512': '512', '1024': '1024', '2048': '2048',
                    '4096': '4096', '8192': '8192 — Pro', '16384': '16384 — Ultra'
                },
                condition: form => !!form.sun_cast_shadows
            },
            shadow_near: { type: 'number', label: 'lightflow_environment.field.shadow_near', value: shadowFrustum.near, min: 0.001, step: 0.1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_camera_quality: { type: 'select', label: 'lightflow_environment.field.shadow_camera_quality',
                description: 'lightflow_environment.field.shadow_camera_quality.desc', value: settings.shadow_camera_quality,
                options: { off: 'lightflow_environment.option.camera_shadow.off', balanced: 'lightflow_environment.option.camera_shadow.balanced', high: 'lightflow_environment.option.camera_shadow.high' },
                condition: form => !!form.sun_cast_shadows },
            shadow_camera_distance: { type: 'number', label: 'lightflow_environment.field.shadow_camera_distance',
                description: 'lightflow_environment.field.shadow_camera_distance.desc', value: settings.shadow_camera_distance, min: 8, max: 100000, step: 8,
                condition: form => !!form.sun_cast_shadows && form.shadow_camera_quality !== 'off' },
            shadow_far: { type: 'number', label: 'lightflow_environment.field.shadow_far', value: shadowFrustum.far, min: 2, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_softness_mode: { type: 'select', label: 'lightflow_environment.field.shadow_softness_mode',
                description: 'lightflow_environment.field.shadow_softness_mode.desc', value: settings.shadow_softness_mode,
                options: { hard: 'lightflow_environment.shadow_mode.hard', artistic: 'lightflow_environment.shadow_mode.artistic', distance: 'lightflow_environment.shadow_mode.distance', legacy: 'lightflow_environment.shadow_mode.legacy' },
                condition: form => !!form.sun_cast_shadows && !form.pixelated_shadows },
            shadow_blur: { type: 'range', label: 'lightflow_environment.field.shadow_blur', description: 'lightflow_environment.field.shadow_blur.desc',
                value: settings.shadow_blur, min: 0, max: 64, step: 0.25,
                condition: form => !!form.sun_cast_shadows && !form.pixelated_shadows && form.shadow_softness_mode === 'artistic' },
            shadow_softness: { type: 'range', label: 'lightflow_environment.field.shadow_softness', description: 'lightflow_environment.field.shadow_softness.desc', value: settings.shadow_softness,
                min: 0, max: 8, step: 0.05, condition: form => !!form.sun_cast_shadows && !form.pixelated_shadows && ['distance', 'legacy'].includes(form.shadow_softness_mode) },
            shadow_bias: { type: 'number', label: 'lightflow_environment.field.shadow_bias', value: settings.shadow_bias, min: -0.1, max: 0.1, step: 0.00005, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias_auto: { type: 'checkbox', label: 'lightflow_environment.field.normal_bias_auto', value: settings.shadow_normal_bias_auto, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias: { type: 'number', label: 'lightflow_environment.field.normal_bias', value: settings.shadow_normal_bias, min: 0, max: 2, step: 0.001, condition: form => !!form.sun_cast_shadows && !form.shadow_normal_bias_auto },
            pixelated_shadows: { type: 'checkbox', label: 'lightflow_environment.field.pixelated_shadows', value: settings.pixelated_shadows, condition: form => !!form.sun_cast_shadows },
            pixel_shadow_steps: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_steps', value: settings.pixel_shadow_steps, min: 2, max: 16, step: 1, condition: form => !!form.pixelated_shadows },
            pixel_shadow_scale: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_scale', value: settings.pixel_shadow_scale, min: 1, max: 16, step: 1, condition: form => !!form.pixelated_shadows }
        };
        // These sliders become keyframed controls in the timeline editor.
        // Hide their inactive global values to avoid presenting two competing
        // sets of appearance controls in the Environment panel.
        for (const key of [...Object.keys(CLOUD_TIME_NUMERIC_FIELDS), ...CLOUD_TIME_COLOR_FIELDS]) {
            const entry = form[key];
            if (!entry) continue;
            const condition = entry.condition;
            entry.condition = values => !values.cloud_time_profiles_enabled && (!condition || Condition(condition, values));
        }
        return enhanceEnvironmentDialogForm(form);
    }

    const ENVIRONMENT_PANEL_GROUP_PREFIX = '_environment_group_';
    const ENVIRONMENT_PANEL_GROUPS = [
        {
            id: 'time', label: 'lightflow_environment.group.time', icon: 'schedule', color: '#FFF07A',
            entries: ['dimension','dimension_fog_mode','sky_cycle_mode','time', 'animate_time', 'day_length_seconds']
        },
        {
            id: 'sky', label: 'lightflow_environment.group.sky', icon: 'gradient', color: '#78D7FF',
            entries: [
                { subsection: 'lightflow_environment.field.palette_mode', icon: 'palette' },
                'palette_mode', '_sky_gradient_editor', 'day_sky_gradient', 'sunrise_sky_gradient',
                'sunset_sky_gradient', 'night_sky_gradient',
                'sky_time_gradients_enabled', '_sky_time_gradient_editor',
                { subsection: 'lightflow_environment.field.environment', icon: 'language' },
                'sky_intensity', 'sky_gradient_power'
            ]
        },
        {
            id: 'ambient', label: 'lightflow_environment.group.ambient', icon: 'wb_incandescent', color: '#78D7FF',
            entries: [
                'environment_strength',
                'ambient_fill_color_mode', 'ambient_fill_shape', 'ambient_fill_sky_color', 'ambient_fill_ground_color',
                'ambient_fill_day_multiplier', 'ambient_fill_night_multiplier'
            ]
        },
        {
            id: 'fog', label: 'lightflow_environment.group.fog', icon: 'blur_on', color: '#91BFD8',
            entries: [
                'distance_look_presets', 'distance_fog_enabled', 'distance_fog_color_mode',
                'distance_fog_fixed_color', 'distance_fog_day_color', 'distance_fog_sunrise_color', 'distance_fog_night_color',
                { subsection: 'lightflow_environment.field.distance_fog_start', icon: 'straighten' },
                'distance_fog_start', 'distance_fog_end', 'distance_fog_smoothness', 'distance_fog_curve',
                { subsection: 'lightflow_environment.field.distance_fog_gradient', icon: 'gradient' },
                'distance_fog_gradient', 'distance_fog_near_color', 'distance_fog_sky_blend', 'distance_fog_max_opacity', 'distance_fog_sync_background'
            ]
        },
        {
            id: 'fog_texture', label: 'lightflow_environment.field.distance_fog_noise', icon: 'grain', color: '#91BFD8',
            entries: ['distance_fog_noise', 'distance_fog_noise_scale', 'distance_fog_dither']
        },
        {
            id: 'distance_grade', label: 'lightflow_environment.group.distance_grade', icon: 'tune', color: '#91BFD8',
            entries: [
                'distance_grade_enabled', 'distance_grade_follow_fog', 'distance_grade_start', 'distance_grade_end', 'distance_grade_curve',
                'distance_grade_saturation', 'distance_grade_contrast', 'distance_grade_pivot_mode', 'distance_grade_pivot',
                'distance_grade_tint_mode', 'distance_grade_tint', 'distance_grade_tint_strength'
            ]
        },
        {
            id: 'celestial', label: 'lightflow_environment.group.sun', icon: 'wb_sunny', color: '#FFBB68',
            entries: [
                { subsection: 'lightflow_environment.field.sun_enabled', icon: 'light_mode' },
                'sun_enabled', 'sun_azimuth', 'sun_intensity', 'sun_light_color_mode', 'sun_light_day_color', 'sun_light_twilight_color',
                { subsection: 'lightflow_environment.group.appearance', icon: 'visibility' },
                'sun_color', 'celestial_size', 'sun_mode', 'sun_texture_uuid', 'sun_blend_mode', 'sun_opacity',
                { subsection: 'lightflow_environment.group.sun_glow', icon: 'flare' },
                'sun_horizon_scale', 'sun_gaze_scale', 'sun_glare', 'sunset_directional_glow',
                'lens_flare_enabled','lens_flare_strength','lens_flare_scale',
            ]
        },
        {
            id: 'moon', label: 'lightflow_environment.group.moon', icon: 'nights_stay', color: '#C7A6FF',
            entries: [
                'moon_intensity', 'moon_light_color_mode', 'moon_light_custom_color', 'moon_phase', 'moon_mode', 'moon_texture_uuid', 'moon_blend_mode', 'moon_opacity', 'moon_texture_layout', 'moon_atlas_columns', 'moon_atlas_rows', 'moon_phase_offset',
                'moon_color', 'moon_size'
            ]
        },
        {
            id: 'stars', label: 'lightflow_environment.field.stars', icon: 'auto_awesome', color: '#C7A6FF',
            entries: ['stars_enabled', 'star_brightness', 'star_density']
        },
        {
            id: 'clouds', label: 'lightflow_environment.field.clouds', icon: 'cloud', color: '#6ED9FF',
            entries: [
                { subsection: 'lightflow_environment.field.cloud_mode', icon: 'texture' },
                'clouds_enabled', 'cloud_mode', 'cloud_style', 'cloud_texture_uuid',
                'cloud_time_profiles_enabled', '_cloud_time_profiles_editor',
                { subsection: 'lightflow_environment.field.cloud_coverage', icon: 'air' },
                'cloud_coverage', 'cloud_opacity', 'cloud_scale', 'cloud_height', 'cloud_thickness', 'cloud_extrusion'
            ]
        },
        {
            id: 'cloud_motion', label: 'lightflow_environment.group.cloud_motion', icon: 'air', color: '#6ED9FF',
            entries: ['cloud_paused', 'cloud_speed', 'cloud_direction', 'cloud_offset_x', 'cloud_offset_y']
        },
        {
            id: 'cloud_palette', label: 'lightflow_environment.group.cloud_palette', icon: 'palette', color: '#6ED9FF',
            entries: ['cloud_palette_mode', 'cloud_color', 'cloud_top_color', 'cloud_sun_side_color', 'cloud_shadow_side_color', 'cloud_bottom_color', 'cloud_edge_color', 'cloud_shadow_bevel_color', 'cloud_contrast', 'cloud_brightness']
        },
        {
            id: 'cloud_lighting', label: 'lightflow_environment.group.cloud_lighting', icon: 'lightbulb', color: '#6ED9FF',
            entries: [
                'cloud_environment_influence', 'cloud_time_tint_strength',
                'cloud_lighting_mode', 'cloud_sky_tint_strength', 'cloud_sun_tint_strength',
                { subsection: 'lightflow_environment.field.cloud_fog_enabled', icon: 'foggy' },
                'cloud_fog_enabled', 'cloud_fog_color_mode', 'cloud_fog_color', 'cloud_fog_strength', 'cloud_fog_start', 'cloud_fog_end', 'cloud_density', 'cloud_absorption', 'cloud_translucency'
            ]
        },
        {
            id: 'cloud_detail', label: 'lightflow_environment.group.cloud_detail', icon: 'view_in_ar', color: '#6ED9FF',
            entries: ['cloud_scattering_strength', 'cloud_scattering_size', 'cloud_edge_hardness', 'cloud_view_response', 'cloud_gradient_thickness', 'cloud_gradient_alpha', 'cloud_optical_thickness', 'cloud_phase_anisotropy', 'cloud_density_variation', 'cloud_bevel_enabled', 'cloud_bevel_width', 'cloud_bevel_smooth', 'cloud_bevel_softness', 'cloud_bevel_roundness', 'cloud_bevel_strength', 'cloud_bevel_distance_fade', 'cloud_bevel_distance_min_scale', 'cloud_edge_strength', 'cloud_shadow_bevel_strength']
        },
        {
            id: 'bloom', label: 'lightflow_environment.group.bloom', icon: 'flare', color: '#FF9FD0',
            entries: [
                'environment_bloom_enabled',
                { subsection: 'lightflow_environment.field.bloom_strength', icon: 'blur_on' },
                'bloom_threshold', 'bloom_soft_knee', 'bloom_strength', 'bloom_core_strength', 'bloom_core_radius', 'bloom_halo_strength', 'bloom_halo_radius',
                { subsection: 'lightflow_environment.field.bloom_hdr_strength', icon: 'hdr_on' },
                'bloom_hdr_strength', 'bloom_emissive_strength', 'bloom_occlusion',
                { subsection: 'lightflow_environment.field.sun_bloom_contribution', icon: 'wb_sunny' },
                'sun_bloom_contribution', 'moon_bloom_contribution', 'star_bloom_contribution', 'cloud_bloom_contribution'
            ]
        },
        {
            id: 'shadows', label: 'lightflow_environment.group.shadows', icon: 'ev_shadow', color: '#9EA9C8',
            entries: [
                'sun_cast_shadows', 'fit_shadow_region',
                { subsection: 'lightflow_environment.field.shadow_auto_fit', icon: 'center_focus_strong' },
                'shadow_auto_fit', 'shadow_scene_fit', 'shadow_region_locked', 'show_shadow_gizmo', 'shadow_area', 'shadow_near', 'shadow_far',
                { subsection: 'lightflow_environment.field.shadow_resolution', icon: 'high_quality' },
                'shadow_resolution', 'studio_shadow_resolution', 'shadow_camera_quality', 'shadow_camera_distance', 'shadow_softness_mode', 'shadow_blur', 'shadow_softness', 'shadow_bias', 'shadow_normal_bias_auto', 'shadow_normal_bias',
                { subsection: 'lightflow_environment.field.pixelated_shadows', icon: 'grid_on' },
                'pixelated_shadows', 'pixel_shadow_steps', 'pixel_shadow_scale'
            ]
        }
    ];

    // Keep panel and full editor navigation identical; every field has one home.
    function getEnvironmentGroupCategory(id) {
        if (id === 'fog' || id === 'fog_texture' || id === 'distance_grade' || id === 'clouds' || id.startsWith('cloud_')) return 'atmosphere';
        if (['ambient', 'shadows', 'bloom'].includes(id)) return 'lighting';
        return 'sky';
    }

    function environmentPanelValueEquals(left, right) {
        if (Array.isArray(left) || Array.isArray(right)) {
            return Array.isArray(left) && Array.isArray(right) && left.length === right.length
                && left.every((value, index) => environmentPanelValueEquals(value, right[index]));
        }
        if (left && right && typeof left === 'object' && typeof right === 'object') {
            try { return JSON.stringify(left) === JSON.stringify(right); } catch (error) { return false; }
        }
        if (typeof left === 'boolean' || typeof right === 'boolean') return left === right;
        if (left === '' || right === '' || left === null || right === null) return left === right;
        if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
            return Math.abs(Number(left) - Number(right)) < 1e-6;
        }
        return left === right;
    }

    function getNativeSkyPresetOptions() {
        return Object.fromEntries(Object.keys(PRESETS).map(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            return [presetId, {
                name: preset.name,
                icon: preset.icon,
                color: getEnvironmentPresetColorCSS(preset.iconColor)
            }];
        }));
    }

    function selectEnvironmentSkyPreset(presetId, options = {}) {
        const preset = getSkyPreset(presetId);
        if (!preset) return false;
        const previousEnabled = settings.enabled;
        const previousGizmo = settings.show_shadow_gizmo;
        const previousFitCorners = cloneEnvironmentData(settings.shadow_fit_corners);
        const previousDistanceLook = Object.fromEntries(Object.keys(DEFAULT_SETTINGS)
            .filter(key => key.startsWith('distance_fog_') || key.startsWith('distance_grade_'))
            .map(key => [key, cloneEnvironmentData(settings[key])]));
        let nextSettings;
        if (preset.native) {
            nextSettings = getNativeSkyPresetSettings(preset.id, { enabled: previousEnabled });
            nextSettings = normalizeSettings(Object.assign({}, nextSettings, nativeQuickOverrides[preset.id] || {}, { enabled: previousEnabled }));
        } else {
            nextSettings = normalizeSettings(Object.assign(
                {},
                DEFAULT_SETTINGS,
                preset.settings,
                {
                    preset: preset.basePresetId,
                    enabled: previousEnabled,
                    show_shadow_gizmo: previousGizmo,
                    shadow_fit_corners: previousFitCorners
                }
            ));
        }
        // Native sky changes preserve the project's manually edited distance look.
        // An imported/custom preset owns its serialized fog and grading settings.
        if (preset.native) nextSettings = normalizeSettings(Object.assign({}, nextSettings, previousDistanceLook));

        activeSkyPresetId = preset.id;
        applyingSkyPreset = true;
        try {
            applySettings(nextSettings, {
                cause: options.cause || 'sky_preset_select',
                forceShadow: options.forceShadow !== false,
                syncPanel: false,
                render: options.render
            });
        } finally {
            applyingSkyPreset = false;
        }
        saveEnvironmentPresetRegistry();
        rebuildEnvironmentPanelForm();
        return true;
    }

    function createCustomSkyPreset(data = {}, options = {}) {
        const basePresetId = PRESETS[data.basePresetId]
            ? data.basePresetId
            : (PRESETS[settings.preset] ? settings.preset : 'vanilla');
        const nativeIdentity = getNativeSkyPresetDefinition(basePresetId);
        const sourceSettings = data.settings || getNativeSkyPresetSettings(basePresetId, { enabled: settings.enabled });
        const preset = normalizeCustomSkyPreset({
            id: data.id || createEnvironmentPresetId(),
            name: getUniqueSkyPresetName(data.name || `${nativeIdentity.name} Custom`),
            icon: data.icon || nativeIdentity.icon,
            iconColor: data.iconColor || nativeIdentity.iconColor,
            basePresetId,
            settings: sourceSettings,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        });
        if (!preset) return null;
        customSkyPresets[preset.id] = preset;
        saveEnvironmentPresetRegistry();
        if (options.select !== false) {
            selectEnvironmentSkyPreset(preset.id, { cause: options.cause || 'sky_preset_create' });
        } else if (options.refreshPanel !== false) {
            rebuildEnvironmentPanelForm();
        }
        return preset;
    }

    function duplicateEnvironmentSkyPreset(presetId) {
        const source = getSkyPreset(presetId);
        if (!source) return null;
        const sourceSettings = source.native
            ? (presetId === activeSkyPresetId ? cloneEnvironmentData(settings)
                : Object.assign({}, getNativeSkyPresetSettings(source.id, { enabled: settings.enabled }), nativeQuickOverrides[source.id] || {}))
            : cloneEnvironmentData(source.settings);
        const duplicate = createCustomSkyPreset({
            name: `${source.name} Copy`,
            icon: source.icon,
            iconColor: source.iconColor,
            basePresetId: source.basePresetId,
            settings: sourceSettings
        }, { cause: 'sky_preset_duplicate' });
        if (duplicate) Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_duplicated'), 1800);
        return duplicate;
    }

    function updateEnvironmentSkyPresetMetadata(presetId, values = {}) {
        const preset = customSkyPresets[presetId];
        if (!preset) return false;
        if (values.name !== undefined) preset.name = getUniqueSkyPresetName(values.name, preset.id);
        if (values.icon !== undefined) preset.icon = normalizeEnvironmentPresetIcon(values.icon, preset.icon);
        if (values.iconColor !== undefined) preset.iconColor = normalizeEnvironmentPresetColor(values.iconColor) || preset.iconColor;
        preset.updatedAt = Date.now();
        saveEnvironmentPresetRegistry();
        rebuildEnvironmentPanelForm();
        return true;
    }

    const environmentIdentityDialogs = new Set();
    let environmentIdentityMenu = null;
    function showEnvironmentIdentityDialog(dialog) {
        const confirm = dialog.onConfirm, cancel = dialog.onCancel;
        const release = () => { dialog.hide(); dialog.delete(); environmentIdentityDialogs.delete(dialog); };
        dialog.onConfirm = function(...args) {
            if (confirm?.apply(this, args) === false) return false;
            release();
        };
        dialog.onCancel = function(...args) {
            if (cancel?.apply(this, args) === false) return false;
            release();
        };
        environmentIdentityDialogs.add(dialog);
        dialog.show();
    }
    deletables.push({delete() {
        environmentIdentityMenu?.delete?.(); environmentIdentityMenu = null;
        environmentIdentityDialogs.forEach(dialog => { dialog.hide(); dialog.delete(); });
        environmentIdentityDialogs.clear();
    }});

    function openCreateEnvironmentSkyPresetDialog(basePresetId = settings.preset) {
        const initialBaseId = PRESETS[basePresetId] ? basePresetId : 'vanilla';
        const initialIdentity = getNativeSkyPresetDefinition(initialBaseId);
        let lastBaseId = initialBaseId;
        let lastAutoName = `${initialIdentity.name} Custom`;
        let lastAutoIcon = initialIdentity.icon;
        let autoName = true;
        let autoIcon = true;
        const dialog = new Dialog({
            id: 'lightflow_environment_create_sky_preset_dialog',
            title: 'lightflow_environment.dialog.create_preset',
            width: 500,
            form: (window.LightManagerUI?.prepareForm || (form => form))({
                preview: {type: 'bar_display', value: lastAutoName, icon: lastAutoIcon, expand: true},
                base_preset: {
                    type: 'compact_select', show_value_text: true, expand: true, searchable: true, label: 'lightflow_environment.field.base_sky_model',
                    options: getNativeSkyPresetOptions(), value: initialBaseId
                },
                name: { type: 'text', label: 'lightflow_environment.field.preset_name', value: lastAutoName },
                icon: { type: 'icon_select', label: 'lightflow_environment.field.preset_icon', value: lastAutoIcon },
                icon_color: {
                    type: 'compact_select', show_value_text: true, expand: true, label: 'lightflow_environment.field.preset_color',
                    options: Object.fromEntries(getEnvironmentMarkerPresets().map(marker => [marker.id, {
                        name: marker.name || marker.id,
                        icon: 'circle',
                        color: marker.standard || marker.pastel
                    }])),
                    value: initialIdentity.iconColor
                }
            }),
            onFormChange(result) {
                const currentName = String(result?.name || '');
                const currentIcon = String(result?.icon || '');
                if (currentName !== lastAutoName) autoName = false;
                if (currentIcon !== lastAutoIcon) autoIcon = false;
                const nextBaseId = PRESETS[result?.base_preset] ? result.base_preset : initialBaseId;
                if (nextBaseId !== lastBaseId) {
                    const identity = getNativeSkyPresetDefinition(nextBaseId);
                    const nextValues = {};
                    if (autoName) {
                        lastAutoName = `${identity.name} Custom`;
                        nextValues.name = lastAutoName;
                    }
                    if (autoIcon) {
                        lastAutoIcon = identity.icon;
                        nextValues.icon = lastAutoIcon;
                    }
                    nextValues.icon_color = identity.iconColor;
                    lastBaseId = nextBaseId;
                    this.setFormValues(nextValues, false);
                }
                const values = this.form.getResult(), preview = this.form.form_data.preview;
                preview.icon_name = values.icon;
                preview.icon_color = getEnvironmentPresetColorCSS(values.icon_color);
                preview.text = values.name;
                preview.buildDOM?.();
            },
            onConfirm(result) {
                const requestedName = String(result?.name || '').trim();
                if (!requestedName) return false;
                runEnvironmentUndo('lightflow_environment.undo.create_preset', () => createCustomSkyPreset({
                    name: requestedName,
                    icon: result.icon,
                    iconColor: result.icon_color,
                    basePresetId: result.base_preset
                }));
                this.hide();
            }
        });
        showEnvironmentIdentityDialog(dialog);
    }

    function openRenameEnvironmentSkyPresetDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        showEnvironmentIdentityDialog(new Dialog({
            id: 'lightflow_environment_rename_sky_preset_dialog',
            title: 'lightflow_environment.dialog.rename_preset',
            width: 420,
            form: (window.LightManagerUI?.prepareForm || (form => form))({
                name: { type: 'text', label: 'lightflow_environment.field.preset_name', value: preset.name }
            }),
            onConfirm(result) {
                const name = String(result?.name || '').trim();
                if (!name) return false;
                runEnvironmentUndo('lightflow_environment.undo.rename_preset', () => updateEnvironmentSkyPresetMetadata(preset.id, { name }));
                this.hide();
            }
        }));
    }

    function openEnvironmentSkyPresetIconDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        const initialIcon = preset.icon;
        showEnvironmentIdentityDialog(new Dialog({
            id: 'lightflow_environment_sky_preset_icon_dialog',
            title: 'lightflow_environment.dialog.change_preset_icon',
            width: 420,
            form: (window.LightManagerUI?.prepareForm || (form => form))({
                preview: {
                    type: 'bar_display', value: preset.name, icon: initialIcon,
                    icon_color: getEnvironmentPresetColorCSS(preset.iconColor), expand: true
                },
                icon: { type: 'icon_select', label: 'lightflow_environment.field.preset_icon', value: initialIcon }
            }),
            onFormChange(result) {
                const nextIcon = normalizeEnvironmentPresetIcon(result?.icon, initialIcon);
                const preview = this.form?.form_data?.preview;
                if (preview && preview.icon_name !== nextIcon) {
                    preview.icon_name = nextIcon;
                    preview.buildDOM?.();
                }
            },
            onConfirm(result) {
                const icon = String(result?.icon || '').trim();
                if (!icon) return false;
                runEnvironmentUndo('lightflow_environment.undo.change_preset_icon', () => updateEnvironmentSkyPresetMetadata(preset.id, { icon }));
                this.hide();
            }
        }));
    }

    function openEnvironmentSkyPresetBaseDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        showEnvironmentIdentityDialog(new Dialog({
            id: 'lightflow_environment_sky_preset_base_dialog',
            title: 'lightflow_environment.dialog.change_base_sky_model',
            width: 460,
            form: (window.LightManagerUI?.prepareForm || (form => form))({
                base_preset: {
                    type: 'compact_select', show_value_text: true, expand: true, searchable: true, label: 'lightflow_environment.field.base_sky_model',
                    options: getNativeSkyPresetOptions(), value: preset.basePresetId
                }
            }),
            onConfirm(result) {
                const basePresetId = PRESETS[result?.base_preset] ? result.base_preset : preset.basePresetId;
                if (basePresetId !== preset.basePresetId) {
                    runEnvironmentUndo('lightflow_environment.undo.change_base_sky_model', () => {
                        preset.basePresetId = basePresetId;
                        preset.settings = captureEnvironmentPresetSettings(
                            Object.assign({}, preset.settings, { preset: basePresetId }),
                            basePresetId
                        );
                        preset.updatedAt = Date.now();
                        saveEnvironmentPresetRegistry();
                        if (activeSkyPresetId === preset.id) selectEnvironmentSkyPreset(preset.id, { cause: 'sky_preset_change_base' });
                        else rebuildEnvironmentPanelForm();
                    });
                }
                this.hide();
            }
        }));
    }

    function exportEnvironmentSkyPreset(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        const content = JSON.stringify({
            format: SKY_PRESET_FILE_FORMAT,
            version: SKY_PRESET_FILE_VERSION,
            preset: cloneEnvironmentData(preset)
        }, null, 4);
        Blockbench.export({
            type: 'Lightflow Environment Sky Preset',
            extensions: [SKY_PRESET_FILE_EXTENSION],
            name: preset.name || 'Sky Preset',
            content
        });
    }

    function extractEnvironmentSkyPresetImportData(content) {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
        if (parsed.format === SKY_PRESET_FILE_FORMAT) return parsed.preset || null;
        const candidate = parsed.preset || parsed;
        return candidate?.settings && (candidate.basePresetId || candidate.settings.preset)
            ? candidate
            : null;
    }

    function importEnvironmentSkyPresets() {
        Blockbench.import({
            type: 'Lightflow Environment Sky Preset',
            extensions: [SKY_PRESET_FILE_EXTENSION],
            multiple: true
        }, files => {
            const imported = [];
            runEnvironmentUndo('lightflow_environment.undo.import_preset', () => {
                (files || []).forEach(file => {
                    try {
                        const data = extractEnvironmentSkyPresetImportData(file.content);
                        if (!data) return;
                        const preset = createCustomSkyPreset(Object.assign({}, data, {
                            id: createEnvironmentPresetId(),
                            name: getUniqueSkyPresetName(data.name)
                        }), { select: false });
                        if (preset) imported.push(preset);
                    } catch (error) {
                        console.warn('[Lightflow Environment] Sky preset import failed.', error);
                    }
                });
                if (imported.length) selectEnvironmentSkyPreset(imported[0].id, { cause: 'sky_preset_import' });
            });
            if (!imported.length) {
                Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_import_failed'), 2800);
                return;
            }
            Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_imported'), 1800);
        });
    }

    function deleteEnvironmentSkyPreset(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        Blockbench.showMessageBox({
            title: 'lightflow_environment.action.delete_preset',
            message: tl('lightflow_environment.message.delete_preset_confirm').replace('{name}', preset.name),
            icon: 'delete',
            buttons: ['lightflow_environment.action.delete_preset', 'dialog.cancel'],
            confirm: 0,
            cancel: 1
        }, result => {
            if (result !== 0 && result !== 'lightflow_environment.action.delete_preset') return;
            runEnvironmentUndo('lightflow_environment.undo.delete_preset', () => {
                delete customSkyPresets[preset.id];
                if (activeSkyPresetId === preset.id) {
                    selectEnvironmentSkyPreset(preset.basePresetId, { cause: 'sky_preset_delete' });
                } else {
                    saveEnvironmentPresetRegistry();
                    rebuildEnvironmentPanelForm();
                }
            });
        });
    }

    function getEnvironmentPresetColorMenuItems(preset) {
        const currentColor = normalizeEnvironmentPresetColor(preset.iconColor);
        return getEnvironmentMarkerPresets().map(marker => ({
            id: `lightflow_environment_color_${preset.id}_${marker.id}`,
            name: '\u00a0',
            description: marker.name || marker.id,
            icon: 'circle',
            color: marker.standard || marker.pastel,
            marked: marker.id === currentColor,
            click: () => runEnvironmentUndo('lightflow_environment.undo.change_preset_color', () => updateEnvironmentSkyPresetMetadata(preset.id, { iconColor: marker.id }))
        }));
    }

    function getEnvironmentPresetIconMenuItems(preset) {
        // Aspect-ratio glyphs are frame controls; custom input still accepts their IDs.
        const registeredIcons = (window.LightManagerIcons?.list?.() || [])
            .filter(icon => icon.startsWith('lightflow:') && !icon.startsWith('lightflow:aspect-'))
            .map(icon => ({ id: 'registered_' + icon.slice('lightflow:'.length), icon, label: icon }));
        const options = [...ENVIRONMENT_PRESET_ICON_OPTIONS.filter(option => !option.custom), ...registeredIcons,
            { id: 'custom', icon: 'edit', label: tr('lightflow_environment.action.other_icon'), custom: true }];
        const usesPresetIcon = options.some(option => !option.custom && option.icon === preset.icon);
        return options.map(option => ({
            id: `lightflow_environment_icon_${preset.id}_${option.id}`,
            name: option.custom ? option.label : '\u00a0',
            description: option.custom && !usesPresetIcon ? `${option.label} (${preset.icon})` : option.label,
            icon: option.icon,
            marked: option.custom ? !usesPresetIcon : option.icon === preset.icon,
            click: () => option.custom
                ? openEnvironmentSkyPresetIconDialog(preset.id)
                : runEnvironmentUndo('lightflow_environment.undo.change_preset_icon', () => updateEnvironmentSkyPresetMetadata(preset.id, { icon: option.icon }))
        }));
    }

    function getEnvironmentSkyPresetMenuItems() {
        const items = [];
        Object.keys(PRESETS).forEach(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            items.push({
                id: `lightflow_environment_preset_${preset.id}`,
                name: preset.name,
                icon: preset.icon,
                marked: activeSkyPresetId === preset.id,
                click: () => runEnvironmentUndo('lightflow_environment.undo.select_preset', () => selectEnvironmentSkyPreset(preset.id)),
                children: [
                    { icon: 'lock', name: 'lightflow_environment.info.native_preset_locked', click() {} },
                    '_',
                    {
                        icon: 'content_copy',
                        name: 'lightflow_environment.action.create_editable_copy',
                        click: () => runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(preset.id))
                    }
                ]
            });
        });
        items.push('_');
        Object.values(customSkyPresets).forEach(preset => {
            items.push({
                id: `lightflow_environment_preset_${preset.id}`,
                name: preset.name,
                icon: preset.icon,
                marked: activeSkyPresetId === preset.id,
                click: () => runEnvironmentUndo('lightflow_environment.undo.select_preset', () => selectEnvironmentSkyPreset(preset.id)),
                children: [
                    {
                        icon: 'code_blocks', name: 'lightflow_environment.action.change_base_sky_model',
                        click: () => openEnvironmentSkyPresetBaseDialog(preset.id)
                    },
                    {
                        icon: 'drive_file_rename_outline', name: 'lightflow_environment.action.rename_preset',
                        click: () => openRenameEnvironmentSkyPresetDialog(preset.id)
                    },
                    {
                        icon: 'interests', name: 'lightflow_environment.action.change_preset_icon',
                        children: getEnvironmentPresetIconMenuItems(preset)
                    },
                    {
                        icon: 'palette', name: 'lightflow_environment.action.change_preset_color',
                        children: getEnvironmentPresetColorMenuItems(preset)
                    },
                    '_',
                    {
                        icon: 'content_copy', name: 'lightflow_environment.action.duplicate_preset',
                        click: () => runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(preset.id))
                    },
                    {
                        icon: 'file_save', name: 'lightflow_environment.action.export_preset',
                        click: () => exportEnvironmentSkyPreset(preset.id)
                    },
                    {
                        icon: 'delete', name: 'lightflow_environment.action.delete_preset',
                        click: () => deleteEnvironmentSkyPreset(preset.id)
                    }
                ]
            });
        });
        if (!Object.keys(customSkyPresets).length) {
            items.push({
                id: 'lightflow_environment_no_custom_presets',
                name: 'lightflow_environment.info.no_custom_presets',
                icon: 'bookmark_border',
                click() {}
            });
        }
        items.push(
            '_',
            {
                id: 'lightflow_environment_create_preset',
                name: 'lightflow_environment.action.create_preset',
                icon: 'add_circle',
                click: () => openCreateEnvironmentSkyPresetDialog(settings.preset)
            },
            {
                id: 'lightflow_environment_import_preset',
                name: 'lightflow_environment.action.import_preset',
                icon: 'file_open',
                click: importEnvironmentSkyPresets
            }
        );
        return items;
    }

    function openEnvironmentSkyPresetMenu(anchor) {
        if (typeof Menu === 'undefined') return;
        environmentIdentityMenu?.delete?.();
        const items = getEnvironmentSkyPresetMenuItems();
        const menu = new Menu(
            'lightflow_environment_sky_presets_menu',
            items,
            { class: 'lightflow_environment_sky_presets_menu' }
        );
        environmentIdentityMenu = menu;
        menu.open(anchor?.currentTarget || anchor?.target || anchor);
        Object.keys(PRESETS).forEach(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            window.LightManagerUI.IdentityMenu.decorateItem(
                menu,
                `lightflow_environment_preset_${preset.id}`,
                getEnvironmentPresetColorCSS(preset.iconColor)
            );
        });
        Object.values(customSkyPresets).forEach(preset => {
            window.LightManagerUI.IdentityMenu.decorateItem(
                menu,
                `lightflow_environment_preset_${preset.id}`,
                getEnvironmentPresetColorCSS(preset.iconColor)
            );
        });
        window.LightManagerUI.GridMenu.decorate(menu, {
            itemSelector: 'li[menu_item^="lightflow_environment_color_"]',
            columns: 5, maxColumns: 5, cellSize: 36, padding: 6, refined: true
        });
        window.LightManagerUI.GridMenu.decorate(menu, {
            itemSelector: 'li[menu_item^="lightflow_environment_icon_"]',
            columns: 5, maxColumns: 5, cellSize: 36, padding: 6, refined: true,
            footerSelector: '[menu_item$="_custom"]'
        });
        menu.node?.querySelectorAll('li[menu_item^="lightflow_environment_icon_"][menu_item$="_custom"]')
            .forEach(item => item.classList.add('light_manager_identity_custom_icon_item'));
    }

    function createEnvironmentSkyPresetInfoDisplay() {
        const identity = getActiveSkyPresetIdentity();
        return {
            type: 'bar_display',
            value: identity.name,
            icon: identity.icon,
            icon_color: identity.iconColor,
            paragraph: false,
            expand: true,
            color: 'var(--color-text)',
            separator: true,
            separator_color: 'var(--color-subtle_text)',
            text_alignment: 'left',
            padding_vertical: 0,
            title: identity.native
                ? 'lightflow_environment.info.native_preset_locked'
                : 'lightflow_environment.info.custom_preset_editable'
        };
    }

    function combineEnvironmentPanelCondition(groupKey, groupOpen, originalCondition) {
        return form => {
            const isOpen = form && Object.prototype.hasOwnProperty.call(form, groupKey)
                ? form[groupKey] !== false
                : groupOpen;
            if (!isOpen) return false;
            if (!originalCondition) return true;
            if (typeof Condition === 'function') return Condition(originalCondition, form);
            return typeof originalCondition === 'function' ? !!originalCondition(form) : !!originalCondition;
        };
    }

    function withoutEnvironmentControlType(control) {
        const options = Object.assign({}, control);
        delete options.type;
        return options;
    }

    function createEnvironmentPanelControl(key, original, groupKey, groupOpen, defaults = DEFAULT_SETTINGS) {
        const design = window.LightManagerUI.formDesign;
        const condition = combineEnvironmentPanelCondition(groupKey, groupOpen, original.condition);
        const originalDisableCondition = original.disable_condition;
        const originalDisableDesc = original.disable_desc;
        const resolveOriginalDisableDesc = form => {
            if (!originalDisableDesc) return '';
            return typeof originalDisableDesc === 'function'
                ? originalDisableDesc(form)
                : originalDisableDesc;
        };
        const base = Object.assign({}, original, {
            default: defaults[key],
            modified: result => !environmentPanelValueEquals(result?.[key] ?? settings[key], defaults[key]),
            condition,
            title: original.title || original.description || original.label,
            description: original.description || original.label,
            disable_condition: form => {
                if (form?.enabled === false) return true;
                if (!originalDisableCondition) return false;
                if (typeof Condition === 'function') return Condition(originalDisableCondition, form);
                return typeof originalDisableCondition === 'function'
                    ? !!originalDisableCondition(form)
                    : !!originalDisableCondition;
            },
            disable_desc: form => {
                if (form?.enabled === false) return 'lightflow_environment.info.environment_disabled';
                return resolveOriginalDisableDesc(form);
            }
        });
        const originalOnBefore = base.onBefore;
        const originalOnAfter = base.onAfter;
        const withUndo = (control, labelKey = 'lightflow_environment.undo.edit') => Object.assign(control, {
            onBefore: event => {
                beginEnvironmentUndo(labelKey);
                originalOnBefore?.(event);
            },
            onAfter: event => {
                try {
                    originalOnAfter?.(event);
                } finally {
                    finishEnvironmentUndo();
                }
            }
        });

        if (base.type === 'gradient_editor') {
            return withUndo(design.gradient(Object.assign(base, {
                compact: true,
                height: 32,
                handle_size: 18,
                padding: '4px 0',
                ...(['day_sky_gradient', 'sunrise_sky_gradient', 'sunset_sky_gradient', 'night_sky_gradient'].includes(key) ? {
                    stop_controls: true,
                    stop_selector: true,
                    short_label: `lightflow_environment.gradient.${key}`,
                    axis_labels: ['lightflow_environment.gradient.ground', 'lightflow_environment.gradient.horizon', 'lightflow_environment.gradient.zenith'],
                } : {})
            })), 'lightflow_environment.undo.edit_gradient');
        }

        if (['sun_texture_uuid','moon_texture_uuid','cloud_texture_uuid'].includes(key)) {
            delete base.options;
            return withUndo(design.texture(withoutEnvironmentControlType(base)));
        }
        if (base.type === 'compact_select' || base.type === 'select') {
            delete base.hide_label;
            delete base.show_value_text;
            delete base.expand;
            delete base.background;
            return withUndo(design.enum(withoutEnvironmentControlType(base)));
        }
        if (base.type === 'custom_checkbox' || base.type === 'checkbox') {
            return withUndo(design.checkbox(Object.assign(withoutEnvironmentControlType(base), {
                icon_size: '22px'
            })));
        }
        if (base.type === 'color') {
            return withUndo(design.color(withoutEnvironmentControlType(base)));
        }
        if (base.type === 'number') {
            const resetValue = Number(defaults[key] ?? DEFAULT_SETTINGS[key]);
            const min = Number.isFinite(base.min) ? base.min : 0;
            const fallbackMax = Math.max(min + 1, Math.abs(resetValue || 1) * 4, key === 'shadow_far' ? 1000 : 100);
            return withUndo(Object.assign(base, {
                type: 'combo_slider',
                min,
                max: Number.isFinite(base.max) ? base.max : fallbackMax,
                allow_higher: !Number.isFinite(base.max),
                allow_lower: !Number.isFinite(base.min),
                resettable: Number.isFinite(resetValue),
                reset_value: Number.isFinite(resetValue) ? resetValue : base.value
            }));
        }
        if (base.type === 'combo_slider' || base.type === 'range') {
            const resetValue = Number(defaults[key] ?? DEFAULT_SETTINGS[key]);
            return withUndo(Object.assign(base, {
                type: 'combo_slider',
                resettable: Number.isFinite(resetValue),
                reset_value: Number.isFinite(resetValue) ? resetValue : base.value
            }));
        }
        return withUndo(base);
    }

    function createPanelForm() {
        const design = window.LightManagerUI.formDesign;
        const source = createDialogForm();
        const activePreset = getSkyPreset(activeSkyPresetId);
        const baseDefaults = activePreset?.custom
            ? activePreset.settings
            : getNativeSkyPresetSettings(activePreset?.id || settings.preset, { enabled: settings.enabled });
        const presetGradients = getPresetSkyGradientProfiles();
        const presetPalette = PRESETS[settings.preset] || PRESETS.vanilla;
        const effectiveDefaults = Object.assign({}, baseDefaults, {
            day_sky_gradient: presetGradients.day,
            sunrise_sky_gradient: presetGradients.sunrise,
            sunset_sky_gradient: presetGradients.sunset,
            night_sky_gradient: presetGradients.night,
            sun_color: presetPalette.sun,
            moon_color: presetPalette.moon,
            cloud_color: presetPalette.cloud
        });
        const form = {
            _environment_preset_identity: createEnvironmentSkyPresetInfoDisplay(),
            _environment_preset_menu: {
                type: 'action_button',
                icon: 'more_horiz',
                description: 'lightflow_environment.action.manage_presets',
                color: 'var(--color-text)',
                click: event => openEnvironmentSkyPresetMenu(event)
            },
            _environment_resource_hint: {
                type: 'bar_display', icon: 'info', paragraph: true, expand: true,
                value: tr('lightflow_environment.resources.missing'),
                color: 'var(--color-subtle_text)', search_ignore: true,
                condition: form => form?.enabled !== false && ['unavailable', 'error'].includes(vanillaResourceStatus.state)
            },
            _environment_region: {
                type: 'action_button', icon: 'control_camera',
                description: 'light_manager.ui.sun_region',
                condition: () => !!window.BarItems?.lightflow_sun_region_tool && Condition(BarItems.lightflow_sun_region_tool.condition),
                click: () => { const tool = window.BarItems?.lightflow_sun_region_tool; if (tool && Condition(tool.condition)) tool.select(); }
            },
            enabled: Object.assign(design.checkbox(Object.assign(withoutEnvironmentControlType(source.enabled), {
                icon_size: '22px',
                title: source.enabled.description || source.enabled.label
            })), {
                onBefore: () => beginEnvironmentUndo(),
                onAfter: () => finishEnvironmentUndo()
            }),
            _environment_disabled_hint: {
                type: 'bar_display',
                value: tr('lightflow_environment.panel.disabled_hint', 'Enable Render Environment to edit.'),
                icon: 'info',
                paragraph: true,
                expand: true,
                search_ignore: true,
                color: 'var(--color-subtle_text)',
                condition: form => form?.enabled === false
            },
            _environment_category: design.tabs({
                value: environmentPanelCategory,
                description: 'light_manager.ui.sections',
                options: {
                    sky: { name: 'lightflow_environment.panel.category_sky' },
                    atmosphere: { name: 'lightflow_environment.panel.category_atmosphere' },
                    lighting: { name: 'lightflow_environment.panel.category_lighting' }
                }
            }),
            _environment_edit_copy: {
                type: 'action_button', semantic_button: true, icon: 'content_copy',
                text: 'lightflow_environment.action.create_editable_copy',
                description: tl('lightflow_environment.info.quick_preset'),
                condition: result => result.enabled !== false && isNativeSkyPresetSelected(),
                click: () => runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(activeSkyPresetId))
            },
            _environment_search: design.search({
                placeholder: 'Find setting', active_label: 'Active only', collapse_label: 'Collapse all'
            })
        };
        form._environment_quick_hint = {
            type: 'bar_display', value: tl('lightflow_environment.info.quick_preset'), icon: 'tune',
            paragraph: true, expand: true, color: 'var(--color-subtle_text)', font_size: 11,
            condition: () => isNativeSkyPresetSelected()
        };

        ENVIRONMENT_PANEL_GROUPS.forEach(group => {
            const category = getEnvironmentGroupCategory(group.id);
            const categoryVisible = environmentPanelCategory === category;
            const groupKey = ENVIRONMENT_PANEL_GROUP_PREFIX + group.id;
            const groupOpen = environmentPanelGroupsOpen[group.id] !== false;
            const settingKeys = group.entries.filter(entry => typeof entry === 'string');
            const modified = settingKeys.some(key => Object.prototype.hasOwnProperty.call(effectiveDefaults || DEFAULT_SETTINGS, key)
                && !environmentPanelValueEquals(settings[key], (effectiveDefaults || DEFAULT_SETTINGS)[key]));
            const enabledKey = settingKeys.find(key => /_enabled$/.test(key));
            form[groupKey] = design.group({
                panel_category_visible: categoryVisible,
                label: group.label,
                label_icon: group.icon,
                label_icon_color: group.color,
                value: groupOpen,
                icon_size: '20px',
                icon_color_on: group.color,
                icon_color_off: `color-mix(in srgb, ${group.color} 55%, var(--color-subtle_text))`,
                description: group.label,
                modified: form => settingKeys.some(key => Object.prototype.hasOwnProperty.call(effectiveDefaults || DEFAULT_SETTINGS, key)
                    && !environmentPanelValueEquals(
                        form && Object.prototype.hasOwnProperty.call(form, key) ? form[key] : settings[key],
                        (effectiveDefaults || DEFAULT_SETTINGS)[key]
                    )),
                modified_label: 'Contains modified settings',
                modified_color: group.color,
                active: enabledKey ? settings[enabledKey] !== false : true
            });

            let subsectionIndex = 0;
            group.entries.forEach(entry => {
                if (entry && typeof entry === 'object' && entry.subsection) {
                    const subsectionKey = `_environment_subsection_${group.id}_${subsectionIndex++}`;
                    form[subsectionKey] = design.subsection({
                        panel_category_visible: categoryVisible,
                        value: tr(entry.subsection, entry.subsection),
                        icon: entry.icon,
                        icon_color: group.color,
                        separator_color: `color-mix(in srgb, ${group.color} 58%, var(--color-border))`,
                        border_left: `1px solid color-mix(in srgb, ${group.color} 72%, var(--color-border))`,
                        background: `color-mix(in srgb, ${group.color} 4%, transparent)`,
                        margin_left: '4px',
                        margin_right: '4px',
                        condition: combineEnvironmentPanelCondition(groupKey, groupOpen)
                    });
                    return;
                }
                if (source[entry]) {
                    form[entry] = createEnvironmentPanelControl(entry, source[entry], groupKey, groupOpen, effectiveDefaults || DEFAULT_SETTINGS);
                    form[entry].panel_category_visible = categoryVisible;
                }
            });
        });
        return form;
    }

    function establishEnvironmentPanelAttachment() {
        if (window.LightManagerUI?.workspace && environmentPanel) {
            environmentPanelAttachmentEstablished = true;
            return window.LightManagerUI.workspace.register(environmentPanel);
        }
        if (environmentPanelAttachmentEstablished || !environmentPanel) return false;
        const overridesPanel = Panels?.material_properties;
        if (!overridesPanel) return false;
        if (environmentPanel.getHostPanel?.() !== overridesPanel) {
            overridesPanel.attachPanel(environmentPanel, 1);
        } else {
            overridesPanel.update?.();
        }
        environmentPanelAttachmentEstablished = true;
        return true;
    }

    function createSkyGradientDialogForm(selectedGradient = 'day_sky_gradient') {
        const profiles = getSkyGradientProfiles();
        const presetGradients = getPresetSkyGradientProfiles();
        const form = {
            _gradient_profile: window.LightManagerUI.formDesign.tabs({
                presentation:'flat',
                value: selectedGradient,
                options: {
                    day_sky_gradient: {name: 'lightflow_environment.gradient.day_sky_gradient'},
                    sunrise_sky_gradient: {name: 'lightflow_environment.gradient.sunrise_sky_gradient'},
                    sunset_sky_gradient: {name: 'lightflow_environment.gradient.sunset_sky_gradient'},
                    night_sky_gradient: {name: 'lightflow_environment.gradient.night_sky_gradient'}
                }
            }),
            gradient_info: {
                type: 'bar_display', icon: 'gradient',
                value: tr('lightflow_environment.gradient.quick_info', 'Select a color to edit it. Double-click the bar to add a point. Drag diamonds to adjust the blend.'),
                description: 'lightflow_environment.gradient.info',
                paragraph: true, expand: true, color: 'var(--color-subtle_text)'
            },
            day_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.day_sky_gradient',
                description: 'lightflow_environment.field.day_sky_gradient.desc', icon: 'light_mode',
                value: profiles.day, default: presetGradients.day,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(0, 'pastel', '#A2EBFF')
            },
            sunrise_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunrise_sky_gradient',
                description: 'lightflow_environment.field.sunrise_sky_gradient.desc', icon: 'wb_twilight',
                value: profiles.sunrise, default: presetGradients.sunrise,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(2, 'pastel', '#F1BB75')
            },
            sunset_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunset_sky_gradient',
                description: 'lightflow_environment.field.sunset_sky_gradient.desc', icon: 'wb_twilight',
                value: profiles.sunset, default: presetGradients.sunset,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(3, 'pastel', '#FFAA87')
            },
            night_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.night_sky_gradient',
                description: 'lightflow_environment.field.night_sky_gradient.desc', icon: 'nights_stay',
                value: profiles.night, default: presetGradients.night,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(4, 'pastel', '#C5A6E8')
            },
            sky_gradient_power: {
                type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power,
                min: 0.5, max: 8, step: 0.05
            },
            sky_intensity: {
                type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity,
                min: 0, max: 4, step: 0.05
            }
        };
        ['day_sky_gradient', 'sunrise_sky_gradient', 'sunset_sky_gradient', 'night_sky_gradient'].forEach(key => Object.assign(form[key], {
            stop_controls: true,
            stop_selector: true,
            condition: result => result._gradient_profile === key,
            axis_labels: ['lightflow_environment.gradient.ground', 'lightflow_environment.gradient.horizon', 'lightflow_environment.gradient.zenith']
        }));
        return enhanceEnvironmentDialogForm(form);
    }

    function openSkyGradientDialog(selectedGradient) {
        const initialSettings = JSON.parse(JSON.stringify(settings));
        if (!['day_sky_gradient', 'sunrise_sky_gradient', 'sunset_sky_gradient', 'night_sky_gradient'].includes(selectedGradient)) selectedGradient = 'day_sky_gradient';
        const formConfig = createSkyGradientDialogForm(selectedGradient);
        const signatureOf = form => JSON.stringify({
            day_sky_gradient: form.day_sky_gradient,
            sunrise_sky_gradient: form.sunrise_sky_gradient,
            sunset_sky_gradient: form.sunset_sky_gradient,
            night_sky_gradient: form.night_sky_gradient,
            sky_gradient_power: form.sky_gradient_power,
            sky_intensity: form.sky_intensity
        });
        const initialSignature = signatureOf({
            day_sky_gradient: formConfig.day_sky_gradient.value,
            sunrise_sky_gradient: formConfig.sunrise_sky_gradient.value,
            sunset_sky_gradient: formConfig.sunset_sky_gradient.value,
            night_sky_gradient: formConfig.night_sky_gradient.value,
            sky_gradient_power: formConfig.sky_gradient_power.value,
            sky_intensity: formConfig.sky_intensity.value
        });
        let changed = false;
        let closed = false;
        const previewTimes = {day_sky_gradient: 6000, sunrise_sky_gradient: 23500,
            sunset_sky_gradient: 12500, night_sky_gradient: 18000};
        const previewPalette = profile => applySettings({
            time: previewTimes[profile] ?? initialSettings.time,
            animate_time: false
        }, {cause: 'gradient_palette_preview', forceShadow: false, syncPanel: false});
        const applyGradientForm = (form, options, preview = true) => applySettings({
            palette_mode: 'custom',
            day_sky_gradient: form.day_sky_gradient,
            sunrise_sky_gradient: form.sunrise_sky_gradient,
            sunset_sky_gradient: form.sunset_sky_gradient,
            night_sky_gradient: form.night_sky_gradient,
            sky_gradient_power: form.sky_gradient_power,
            sky_intensity: form.sky_intensity,
            time: preview ? (previewTimes[form._gradient_profile] ?? initialSettings.time) : initialSettings.time,
            animate_time: preview ? false : initialSettings.animate_time
        }, options);
        beginEnvironmentUndo('lightflow_environment.undo.edit_gradient');
        const dialog = new Dialog('lightflow_environment_gradient_dialog', {
            title: 'lightflow_environment.dialog.gradient_title',
            width: 640,
            form: (window.LightManagerUI?.prepareForm || (form => form))(formConfig),
            onFormChange(form) {
                if (closed) return;
                if (!changed && signatureOf(form) === initialSignature) {
                    previewPalette(form._gradient_profile);
                    return;
                }
                changed = true;
                applyGradientForm(form, { cause: 'gradient_dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                closed = true;
                if (changed || signatureOf(form) !== initialSignature) {
                    applyGradientForm(form, { cause: 'gradient_dialog_confirm', forceShadow: false, syncPanel: true }, false);
                } else {
                    applySettings({time: initialSettings.time, animate_time: initialSettings.animate_time}, {cause: 'gradient_preview_end', forceShadow: false, syncPanel: true});
                }
                finishEnvironmentUndo();
            },
            onCancel() {
                closed = true;
                applySettings(initialSettings, {
                    cause: 'gradient_dialog_cancel', forceShadow: false, syncPanel: true,
                    captureShadowFitRegion: false
                });
                cancelEnvironmentUndo(true);
            }
        });
        dialog.show();
        previewPalette(selectedGradient);
        const selectedStop = environmentPanel?.form?.form_data[selectedGradient]?.selectedStopId;
        if (selectedStop) dialog.form.form_data[selectedGradient]?.selectStop?.(selectedStop);
        dialog.form.form_data[selectedGradient]?.track?.focus();
    }

    function openSkyTimeGradientDialog() {
        if (settings.palette_mode !== 'custom' || getDimensionAtmosphere()) return;
        const initialSettings = cloneEnvironmentData(settings);
        let frames = ensureSkyTimeAnchors(settings.sky_time_gradients.length >= 2
            ? settings.sky_time_gradients : seedSkyTimeGradients());
        let selectedId = frames.reduce((best, frame) =>
            Math.abs(frame.time - initialSettings.time) < Math.abs(best.time - initialSettings.time) ? frame : best, frames[0]).id;
        let newTime = Math.round(initialSettings.time);
        let updating = false;
        let closed = false;
        let dialog;
        const selectedFrame = () => frames.find(frame => frame.id === selectedId) || frames[0];
        const sortedFrames = () => cloneEnvironmentData(frames).sort((a, b) => a.time - b.time);
        const preview = () => {
            if (closed) return;
            applySettings({
                palette_mode: 'custom', sky_time_gradients_enabled: true,
                sky_time_gradients: sortedFrames(), time: selectedFrame().time,
                animate_time: false
            }, {cause: 'gradient_dialog_preview', syncPanel: false, forceShadow: false});
            refreshEnvironmentTimeGallery(dialog, frames, selectedFrame().time);
        };
        const build = () => {
            const frame = selectedFrame();
            const options = environmentTimeOptions(frames);
            return enhanceEnvironmentDialogForm({
                _timeline_info: {
                    type: 'bar_display', icon: 'schedule', paragraph: true, expand: true,
                    value: tr('lightflow_environment.info.timeline_preview'),
                    description: 'lightflow_environment.info.sky_time_gradients',
                    color: 'var(--color-subtle_text)'
                },
                active_frame: {
                    type: 'grid_select', label: 'lightflow_environment.field.sky_time_select',
                    value: frame.id, options,
                    onAfter: () => queueMicrotask(() => dialog?.form?.form_data.active_frame.buttons.get(selectedId)?.focus())
                },
                frame_time: {
                    type: 'number', label: 'lightflow_environment.field.sky_time_tick',
                    value: frame.time, min: 0, max: 23999, step: 1,
                    disable_condition: () => !!getSkyTimeAnchor(selectedFrame()),
                    disable_desc: getSkyTimeAnchor(frame) ? 'lightflow_environment.info.fixed_sky_phase' : undefined
                },
                frame_gradient: {
                    type: 'gradient_editor', label: 'lightflow_environment.field.sky_time_gradient',
                    icon: 'gradient', value: frame.gradient,
                    default: getSkyTimeAnchor(frame) ? getPresetSkyGradientProfiles()[frame.phase] : frame.gradient,
                    min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS,
                    lock_endpoints: true, show_midpoints: true, stop_controls: true, stop_selector: true,
                    height: 48, preview_resolution: 640,
                    axis_labels: ['lightflow_environment.gradient.ground', 'lightflow_environment.gradient.horizon', 'lightflow_environment.gradient.zenith']
                },
                add_time: {
                    type: 'number', label: 'lightflow_environment.field.sky_time_new',
                    value: newTime, min: 0, max: 23999, step: 1
                },
                _add_frame: {
                    type: 'action_button', semantic_button: true, icon: 'add',
                    text: 'lightflow_environment.action.sky_time_add',
                    condition: () => frames.length < SKY_TIME_GRADIENT_MAX_FRAMES,
                    click: () => {
                        if (closed || frames.length >= SKY_TIME_GRADIENT_MAX_FRAMES) return;
                        const time = readEnvironmentNewTime(dialog);
                        if (time === null) return;
                        const existing = frames.find(entry => entry.time === time);
                        if (existing) {
                            selectedId = existing.id;
                        } else {
                            const generated = makeSkyTimeGradient(time, position =>
                                sampleSkyTimeGradient(position, time, sortedFrames()));
                            generated.id = `clock_${time}_${frames.length}`;
                            frames.push(generated);
                            selectedId = generated.id;
                        }
                        rebuild();
                        preview();
                    }
                },
                _remove_frame: {
                    type: 'action_button', semantic_button: true, icon: 'delete',
                    text: 'lightflow_environment.action.sky_time_remove',
                    condition: () => !getSkyTimeAnchor(selectedFrame()) && frames.length > 2,
                    click: () => {
                        if (closed || getSkyTimeAnchor(selectedFrame()) || frames.length <= 2) return;
                        const order = sortedFrames();
                        const index = order.findIndex(frame => frame.id === selectedId);
                        frames = frames.filter(frame => frame.id !== selectedId);
                        selectedId = order[index > 0 ? index - 1 : 1].id;
                        rebuild();
                        preview();
                    }
                }
            });
        };
        const rebuild = () => {
            if (!dialog?.form) return;
            updating = true;
            try {
                dialog.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(build());
                dialog.form.buildForm();
            } finally { updating = false; }
        };
        beginEnvironmentUndo('lightflow_environment.undo.edit_gradient');
        dialog = new Dialog('lightflow_environment_time_gradient_dialog', {
            title: 'lightflow_environment.dialog.sky_time_gradients', width: 640,
            form: (window.LightManagerUI?.prepareForm || (form => form))(build()),
            onFormChange(form) {
                if (updating || closed) return;
                if (form.active_frame !== selectedId && frames.some(frame => frame.id === form.active_frame)) {
                    selectedId = form.active_frame;
                    rebuild();
                    preview();
                    return;
                }
                const current = selectedFrame();
                const time = getSkyTimeAnchor(current)?.time ?? readEnvironmentFrameTime(form, current.time);
                let dirty = false;
                if (time !== current.time) {
                    if (!frames.some(frame => frame !== current && frame.time === time)) {
                        current.time = time;
                        dirty = true;
                    } else {
                        // Never show a duplicated tick which will not be saved.
                        updating = true;
                        try { refreshEnvironmentTimeGallery(dialog, frames, current.time); }
                        finally { updating = false; }
                    }
                }
                if (form.frame_gradient && JSON.stringify(form.frame_gradient) !== JSON.stringify(current.gradient)) {
                    current.gradient = cloneEnvironmentData(form.frame_gradient);
                    dirty = true;
                }
                newTime = parseEnvironmentClockTime(form.add_time, newTime);
                if (dirty) preview();
            },
            onConfirm(form) {
                if (closed) return;
                if (!updating && form?.active_frame === selectedId) {
                    const current = selectedFrame();
                    const time = getSkyTimeAnchor(current)?.time ?? readEnvironmentFrameTime(form, current.time);
                    if (!frames.some(frame => frame !== current && frame.time === time)) current.time = time;
                    if (form.frame_gradient) current.gradient = cloneEnvironmentData(form.frame_gradient);
                }
                closed = true;
                applySettings({sky_time_gradients: sortedFrames(), sky_time_gradients_enabled: true,
                    time: initialSettings.time, animate_time: initialSettings.animate_time},
                    {cause: 'gradient_dialog_confirm', forceShadow: false, syncPanel: true});
                finishEnvironmentUndo();
            },
            onCancel() {
                if (closed) return;
                closed = true;
                applySettings(initialSettings, {cause: 'gradient_dialog_cancel', forceShadow: false,
                    syncPanel: true, captureShadowFitRegion: false});
                cancelEnvironmentUndo(true);
            }
        });
        dialog.show();
        preview();
    }

    function openCloudTimeProfilesDialog() {
        if (!settings.clouds_enabled || getDimensionAtmosphere()) return;
        const initialSettings = cloneEnvironmentData(settings);
        let frames = cloneEnvironmentData(settings.cloud_time_profiles.length >= 2
            ? settings.cloud_time_profiles : seedCloudTimeProfiles());
        let selectedId = frames.reduce((best, frame) =>
            Math.abs(frame.time - settings.time) < Math.abs(best.time - settings.time) ? frame : best, frames[0]).id;
        let newTime = Math.round(settings.time);
        let category = 'appearance';
        let updating = false;
        let closed = false;
        let dialog;
        const current = () => frames.find(frame => frame.id === selectedId) || frames[0];
        const sorted = () => cloneEnvironmentData(frames).sort((a, b) => a.time - b.time);
        const preview = () => {
            if (closed || updating) return;
            updating = true;
            try {
                applySettings({cloud_time_profiles_enabled: true, cloud_time_profiles: sorted(),
                    time: current().time, animate_time: false},
                {cause: 'cloud_time_preview', forceShadow: false, syncPanel: false});
                refreshEnvironmentTimeGallery(dialog, frames, current().time);
            } finally { updating = false; }
        };
        const fieldCategory = key => {
            if (key.startsWith('cloud_fog_')) return 'fog';
            if (CLOUD_TIME_COLOR_FIELDS.includes(key)) return 'colors';
            if (['cloud_coverage','cloud_opacity','cloud_contrast','cloud_brightness'].includes(key)) return 'appearance';
            if (key.startsWith('cloud_bevel_') || ['cloud_gradient_thickness','cloud_gradient_alpha',
                'cloud_edge_hardness','cloud_view_response','cloud_edge_strength','cloud_shadow_bevel_strength'].includes(key)) return 'edges';
            if (['cloud_scattering_strength','cloud_scattering_size','cloud_optical_thickness',
                'cloud_phase_anisotropy','cloud_density_variation','cloud_density','cloud_absorption','cloud_translucency'].includes(key)) return 'advanced';
            return 'lighting';
        };
        const fieldVisible = (key, values, definition) => {
            const context = Object.assign({}, settings, current().appearance, values,
                {cloud_time_profiles_enabled:false, cloud_palette_mode:'custom'});
            if (values.cloud_time_section !== fieldCategory(key)) return false;
            if (definition.condition && !Condition(definition.condition,context)) return false;
            const sculpted = settings.cloud_style === 'vibrant_visuals';
            // These older bevel controls have no consumer in the optical shader.
            if (sculpted && ['cloud_bevel_softness','cloud_bevel_roundness','cloud_bevel_distance_min_scale',
                'cloud_shadow_bevel_color','cloud_shadow_bevel_strength','cloud_edge_color'].includes(key)) return false;
            if (!settings.cloud_bevel_enabled && key.startsWith('cloud_bevel_')) return false;
            const gradient = context.cloud_gradient_thickness > 0 && context.cloud_gradient_alpha < 1;
            if (sculpted && ['cloud_edge_hardness','cloud_view_response'].includes(key) && !gradient) return false;
            if (sculpted && key === 'cloud_edge_strength' && (!gradient || context.cloud_scattering_strength <= 0 ||
                context.cloud_environment_influence <= 0 || context.cloud_translucency <= 0)) return false;
            if (['cloud_time_tint_strength','cloud_sky_tint_strength','cloud_sun_tint_strength'].includes(key) &&
                context.cloud_environment_influence <= 0) return false;
            return true;
        };
        const build = () => {
            const frame = current();
            const originals = createDialogForm();
            const form = {
                _cloud_time_info: {type: 'bar_display', icon: 'schedule', paragraph: true,
                    expand: true, value: tr('lightflow_environment.info.timeline_preview'),
                    description: 'lightflow_environment.info.cloud_time_profiles',
                    color: 'var(--color-subtle_text)'},
                active_frame: {type: 'grid_select', label: 'lightflow_environment.field.cloud_time_frame',
                    value: frame.id, options: environmentTimeOptions(frames),
                    onAfter: () => queueMicrotask(() => dialog?.form?.form_data.active_frame.buttons.get(selectedId)?.focus())},
                frame_time: {type: 'number', label: 'lightflow_environment.field.cloud_time_tick',
                    value: frame.time, min: 0, max: 23999, step: 1},
                cloud_time_section: {type: 'select', label: 'lightflow_environment.field.cloud_time_section',
                    value: category, options: {
                        appearance: 'lightflow_environment.option.cloud_time_appearance',
                        colors: 'lightflow_environment.option.cloud_time_colors',
                        edges: 'lightflow_environment.option.cloud_time_edges',
                        lighting: 'lightflow_environment.option.cloud_time_light_only',
                        fog: 'lightflow_environment.option.cloud_time_fog',
                        advanced: 'lightflow_environment.option.cloud_time_advanced'
                    }}
            };
            for (const key of [...Object.keys(CLOUD_TIME_NUMERIC_FIELDS), ...CLOUD_TIME_COLOR_FIELDS]) {
                const definition = originals[key];
                form[key] = Object.assign({}, definition, {
                    value: frame.appearance[key],
                    ...(key === 'cloud_gradient_alpha' ? {label:'lightflow_environment.field.cloud_gradient_hide'} : {}),
                    condition: values => fieldVisible(key,values,definition)
                });
            }
            form._cloud_effect_status = {type:'bar_display', icon:'info', paragraph:true, expand:true,
                value:tr('lightflow_environment.info.cloud_effect_inactive'),
                condition:values => settings.cloud_style === 'vibrant_visuals' && values.cloud_time_section === 'edges' &&
                    (values.cloud_gradient_thickness <= 0 || values.cloud_gradient_alpha >= 1 || values.cloud_scattering_strength <= 0)};
            form.add_time = {type: 'number', label: 'lightflow_environment.field.cloud_time_new',
                value: newTime, min: 0, max: 23999, step: 1};
            form._add_frame = {type: 'action_button', semantic_button: true, icon: 'add',
                text: 'lightflow_environment.action.cloud_time_add',
                condition: () => frames.length < CLOUD_TIME_PROFILE_MAX_FRAMES,
                click: () => {
                    if (closed || frames.length >= CLOUD_TIME_PROFILE_MAX_FRAMES) return;
                    const time = readEnvironmentNewTime(dialog);
                    if (time === null) return;
                    const found = frames.find(frame => frame.time === time);
                    if (found) selectedId = found.id;
                    else {
                        const added = {id: `cloud_clock_${time}`, time,
                            appearance: sampleCloudTimeAppearance(time, sorted())};
                        frames.push(added);
                        selectedId = added.id;
                    }
                    rebuild(); preview();
                }};
            form._remove_frame = {type: 'action_button', semantic_button: true, icon: 'delete',
                text: 'lightflow_environment.action.cloud_time_remove',
                condition: () => frames.length > 2,
                click: () => {
                    if (closed || frames.length <= 2) return;
                    const order = sorted();
                    const index = order.findIndex(frame => frame.id === selectedId);
                    frames = frames.filter(frame => frame.id !== selectedId);
                    selectedId = order[index > 0 ? index - 1 : 1].id;
                    rebuild(); preview();
                }};
            return enhanceEnvironmentDialogForm(form);
        };
        const rebuild = () => {
            if (!dialog?.form) return;
            updating = true;
            try {
                dialog.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(build());
                dialog.form.buildForm();
                dialog.form.updateValues({cause:'setup'});
            } finally { updating = false; }
        };
        const applyFields = (form, changedKeys) => {
            if (!form) return false;
            const frame = current();
            let changed = false;
            const edited = Array.isArray(changedKeys) && changedKeys.length ? new Set(changedKeys) : null;
            const tick = !edited || edited.has('frame_time') || edited.has('frame_clock')
                ? readEnvironmentFrameTime(form,frame.time) : frame.time;
            if (tick !== frame.time) {
                if (!frames.some(other => other !== frame && other.time === tick)) {
                    frame.time = tick; changed = true;
                } else {
                    updating = true;
                    try { refreshEnvironmentTimeGallery(dialog, frames, frame.time); }
                    finally { updating = false; }
                }
            }
            for (const key of [...Object.keys(CLOUD_TIME_NUMERIC_FIELDS), ...CLOUD_TIME_COLOR_FIELDS]) {
                if (form[key] === undefined || (edited && !edited.has(key))) continue;
                if (!edited && dialog?.form?.form_config[key]?.condition &&
                    !Condition(dialog.form.form_config[key].condition,form)) continue;
                const value = CLOUD_TIME_COLOR_FIELDS.includes(key)
                    ? normalizeHex(form[key], frame.appearance[key])
                    : clamp(finite(form[key], frame.appearance[key]), ...CLOUD_TIME_NUMERIC_FIELDS[key]);
                if (value !== frame.appearance[key]) {
                    frame.appearance[key] = value; changed = true;
                }
            }
            frame.appearance.cloud_fog_end = Math.max(frame.appearance.cloud_fog_end,
                frame.appearance.cloud_fog_start + 0.01);
            return changed;
        };
        const onEditorChange = (form,changedKeys) => {
            if (updating || closed) return;
            if (form.active_frame !== selectedId && frames.some(frame => frame.id === form.active_frame)) {
                selectedId = form.active_frame;
                rebuild(); preview(); return;
            }
            category = ['appearance','colors','edges','lighting','fog','advanced'].includes(form.cloud_time_section)
                ? form.cloud_time_section : category;
            newTime = parseEnvironmentClockTime(form.add_time, newTime);
            if (applyFields(form,changedKeys)) preview();
        };
        beginEnvironmentUndo('lightflow_environment.undo.edit');
        dialog = new Dialog('lightflow_environment_cloud_time_dialog', {
            title: 'lightflow_environment.dialog.cloud_time_profiles', width: 640,
            form: (window.LightManagerUI?.prepareForm || (form => form))(build()),
            onConfirm(form) {
                if (closed) return;
                if (!updating && form?.active_frame === selectedId) applyFields(form);
                closed = true;
                applySettings({cloud_time_profiles_enabled: true, cloud_time_profiles: sorted(),
                    time: initialSettings.time, animate_time: initialSettings.animate_time},
                {cause: 'cloud_time_confirm', forceShadow: false, syncPanel: true});
                finishEnvironmentUndo();
            },
            onCancel() {
                if (closed) return;
                closed = true;
                applySettings(initialSettings, {cause: 'gradient_dialog_cancel', forceShadow: false,
                    syncPanel: true, captureShadowFitRegion: false});
                cancelEnvironmentUndo(true);
            }
        });
        dialog.show();
        dialog.form.on('change',({result,changed_keys}) => onEditorChange(result,changed_keys));
        preview();
    }

    function openSettingsDialog() {
        const formConfig = createDialogForm();
        const initialSettings = JSON.parse(JSON.stringify(settings));
        let dialog;
        let previousShadowFrustum = {
            shadow_area: formConfig.shadow_area.value,
            shadow_near: formConfig.shadow_near.value,
            shadow_far: formConfig.shadow_far.value
        };
        const applyDialogSettings = (form, options) => {
            form = Object.fromEntries(Object.entries(form).filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)));
            const enteringCustomPalette = settings.palette_mode !== 'custom' && form.palette_mode === 'custom';
            const shadowFrustumChanged = ['shadow_area', 'shadow_near', 'shadow_far'].some(key => (
                Math.abs(finite(form[key], previousShadowFrustum[key]) - finite(previousShadowFrustum[key], 0)) > 1e-6
            ));
            previousShadowFrustum = {
                shadow_area: form.shadow_area,
                shadow_near: form.shadow_near,
                shadow_far: form.shadow_far
            };
            const updated = applySettings(form, { ...options, captureShadowFitRegion: shadowFrustumChanged });
            if (enteringCustomPalette) {
                for (const key of ['day_sky_gradient', 'sunrise_sky_gradient', 'sunset_sky_gradient',
                    'night_sky_gradient', 'sun_color', 'moon_color', 'cloud_color']) {
                    dialog?.form?.form_data?.[key]?.setValue?.(updated[key]);
                }
            }
        };
        const categories = ['sky','atmosphere','lighting'].map(id=>({id, label:`lightflow_environment.panel.category_${id}`, entries:[]}));
        for (const group of ENVIRONMENT_PANEL_GROUPS) {
            const category = getEnvironmentGroupCategory(group.id);
            categories.find(section=>section.id===category).entries.push(...group.entries.filter(entry=>typeof entry==='string'));
        }
        const categorized = window.LightManagerUI.taskDialogForm(formConfig, categories);
        const grouped = {};
        for (const [key,field] of Object.entries(categorized)) {
            if (key.startsWith('environment_section')) continue;
            const group = ENVIRONMENT_PANEL_GROUPS.find(group=>group.entries.includes(key));
            if (group) {
                const groupKey = `_task_group_${group.id}`;
                if (!grouped[groupKey]) grouped[groupKey] = window.LightManagerUI.formDesign.group({label:group.label, label_icon:group.icon, value:group.id==='time', condition:field.condition});
                const condition = field.condition;
                field.condition = form => Condition(condition,form) && (form[groupKey]!==false || !!String(form._task_search||'').trim());
            }
            grouped[key] = field;
        }
        beginEnvironmentUndo('lightflow_environment.undo.edit');
        dialog = window.LightManagerUI.showTaskDialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 640,
            form: grouped,
            onFormChange(form) {
                applyDialogSettings(form, { cause: 'dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                applyDialogSettings(form, { cause: 'dialog_confirm', forceShadow: true, syncPanel: true });
                finishEnvironmentUndo();
            },
            onCancel() {
                applySettings(initialSettings, {
                    cause: 'dialog_cancel',
                    forceShadow: true,
                    syncPanel: true,
                    captureShadowFitRegion: false
                });
                cancelEnvironmentUndo(true);
            }
        }, environmentTaskDialogs);
    }

    function installUI() {
        const overridesHostId = Panels?.material_properties ? 'material_properties' : (Panels?.lightflow_scene ? 'lightflow_scene' : '');
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
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'left_bar', float_position: [0, 0], float_size: [314, 520], height: 420,
                folded: false, fixed_height: false,
                attached_to: overridesHostId, attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                render: {
                    slot: 'left_bar', height: 420, folded: false, fixed_height: false,
                    attached_to: overridesHostId, attached_index: 1, sidebar_index: 1
                }
            },
            insert_after: 'material_properties',
            form: (window.LightManagerUI?.prepareForm || (form => form))(createPanelForm())
        });
        if (typeof ResizeObserver === 'function' && environmentPanel.node) {
            const observedPanel = environmentPanel;
            const observer = new ResizeObserver(() => {
                if (environmentPanel === observedPanel && environmentPanelFormDirty &&
                    observedPanel.node.getClientRects().length) rebuildEnvironmentPanelForm();
            });
            observer.observe(observedPanel.node);
            deletables.push({ delete: () => observer.disconnect() });
        }
        const environmentPanelListener = environmentPanel.form.on('change', ({ result, changed_keys }) => {
            if (syncingEnvironmentPanel) return;
            const changedKeys = Array.isArray(changed_keys) && changed_keys.length
                ? changed_keys
                : Object.keys(result || {});
            if (changedKeys.includes('_environment_category')) {
                const restoreFocus = environmentPanel.form.form_data._environment_category.node.contains(document.activeElement);
                environmentPanelCategory = result._environment_category;
                rebuildEnvironmentPanelForm();
                if (restoreFocus) queueMicrotask(() => environmentPanel.form.form_data
                    ._environment_category.button_nodes[environmentPanelCategory]?.focus());
                return;
            }
            changedKeys.forEach(key => {
                if (!key.startsWith(ENVIRONMENT_PANEL_GROUP_PREFIX)) return;
                const groupId = key.slice(ENVIRONMENT_PANEL_GROUP_PREFIX.length);
                if (Object.prototype.hasOwnProperty.call(environmentPanelGroupsOpen, groupId)) {
                    environmentPanelGroupsOpen[groupId] = result?.[key] !== false;
                }
            });

            const settingKeys = changedKeys.filter(key => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));
            if (!settingKeys.length) return;
            const panelResult = {};
            settingKeys.forEach(key => {
                if (result && Object.prototype.hasOwnProperty.call(result, key)) panelResult[key] = result[key];
            });
            applySettings(panelResult, { cause: 'environment_panel', forceShadow: false, syncPanel: false });
            if (settingKeys.includes('palette_mode')) rebuildEnvironmentPanelForm();
        });
        deletables.push(environmentPanelListener);
        window.LightManagerUI.applyFormGroups(environmentPanel.form, [
            {
                elements: ['_environment_preset_identity', '_environment_region', '_environment_preset_menu'],
                gap: '2px',
                flex: {
                    _environment_preset_identity: '1 1 auto',
                    _environment_region: '0 0 auto',
                    _environment_preset_menu: '0 0 auto'
                }
            }
        ]);
        establishEnvironmentPanelAttachment();
        const attachmentTimers = [0, 500, 1500].map(delay => setTimeout(establishEnvironmentPanelAttachment, delay));
        const attachmentModeListener = Blockbench.on('select_mode', establishEnvironmentPanelAttachment);
        const panelStyles = window.LightManagerUI.addDesignedPanelStyles('lightflow_environment_panel', {
            scrollbar_width: 4,
            row_padding: '3px 4px'
        });
        const resourceAction = new Action('lightflow_environment_local_resources', {
            name: 'lightflow_environment.resources.title', icon: 'folder_open', category: 'view',
            condition: () => !(window.LightflowTerrainRender || window.BedrockStructureStudio)?.packs?.open,
            click: openVanillaResourceDialog
        });
        MenuBar.menus.view.addAction(resourceAction);
        deletables.push(resourceAction);
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, environmentPanel, panelStyles, attachmentModeListener, {
            delete() {
                attachmentTimers.forEach(timer => clearTimeout(timer));
                environmentPanelAttachmentEstablished = false;
            }
        });
        syncEnvironmentPanel();
    }

    function installTranslations() {
        const translations = {
            'lightflow_environment.plugin.title': 'Lightflow Environment',
            'lightflow_environment.panel.title': 'ENVIRONMENT',
            'lightflow_environment.panel.disabled_hint': 'Enable Render Environment to edit.',
        'lightflow_environment.panel.category_sky': 'Sky',
        'lightflow_environment.field.frame_clock': 'Selected time',
        'lightflow_environment.preview.coverage': 'Coverage',
        'lightflow_environment.info.fixed_sky_phase': 'This base phase has a fixed time and cannot be deleted. Edit its colors, or add another moment at a custom time.',
        'lightflow_environment.preview.opacity': 'Opacity',
        'lightflow_environment.info.invalid_clock': 'Enter a valid time: HH:MM (00:00–23:59), or ticks from 0 to 23999.',
        'lightflow_environment.field.add_clock': 'Create at',
        'lightflow_environment.info.clock_input': 'Enter HH:MM (24-hour clock), or exact Minecraft ticks (0–23999). Existing times are selected instead of duplicated.',
        'lightflow_environment.group.ambient': 'Ambient light',
        'lightflow_environment.info.timeline_preview': 'Preview at the selected time. Closing this editor restores the scene clock; changes blend smoothly between moments.',
        'lightflow_environment.group.sun': 'Sun',
        'lightflow_environment.group.appearance': 'Appearance',
        'lightflow_environment.group.sun_glow': 'Glow & lens flare',
        'lightflow_environment.group.moon': 'Moon',
        'lightflow_environment.group.cloud_motion': 'Movement',
        'lightflow_environment.group.cloud_palette': 'Color & contrast',
        'lightflow_environment.group.cloud_lighting': 'Light & volume',
        'lightflow_environment.group.cloud_detail': 'Edges & bevel',
        'lightflow_environment.panel.category_atmosphere': 'Atmosphere',
        'lightflow_environment.panel.category_lighting': 'Lighting',
            'lightflow_environment.action.open': 'Environment Composer...',
            'lightflow_environment.action.open.desc': 'Edit Minecraft sky, time, sun, moon, clouds, ambient lighting and directional shadows.',
            'lightflow_environment.action.manage_presets': 'Manage Sky Presets',
            'lightflow_environment.action.create_preset': 'New Sky Preset...',
            'lightflow_environment.action.create_editable_copy': 'Create Editable Copy',
            'lightflow_environment.action.import_preset': 'Import Sky Preset',
            'lightflow_environment.action.export_preset': 'Export Sky Preset',
            'lightflow_environment.action.duplicate_preset': 'Duplicate',
            'lightflow_environment.action.delete_preset': 'Delete Sky Preset',
            'lightflow_environment.action.rename_preset': 'Rename...',
            'lightflow_environment.action.change_preset_icon': 'Change Icon',
            'lightflow_environment.action.other_icon': 'Other icon...',
            'lightflow_environment.action.change_preset_color': 'Marker Color',
            'lightflow_environment.action.change_base_sky_model': 'Change Base Sky Model...',
            'lightflow_environment.action.fit_shadow_region': 'Fit Shadows to Selection / Scene',
            'lightflow_environment.action.fit_shadow_region.desc': 'Fit the shadow region to selected geometry, or the whole scene if nothing is selected.',
            'lightflow_environment.dialog.title': 'Minecraft Environment Composer',
            'lightflow_environment.dialog.gradient_title': 'Sky Gradient Editor',
            'lightflow_environment.dialog.create_preset': 'New Sky Preset',
            'lightflow_environment.dialog.rename_preset': 'Rename Sky Preset',
            'lightflow_environment.dialog.change_preset_icon': 'Change Sky Preset Icon',
            'lightflow_environment.dialog.change_base_sky_model': 'Change Base Sky Model',
            'lightflow_environment.action.edit_gradients': 'Edit sky gradients…',
            'lightflow_environment.action.edit_gradients.desc': 'Edit separate day, dawn, sunset, and night sky gradients',
            'lightflow_environment.gradient.info': 'Double-click the bar to add a color. Drag stops to position them, or enter a percentage below. Diamonds adjust the blend. Use Up/Down to select a stop, Left/Right to fine-tune, and Shift for larger steps. The endpoint positions stay fixed; their colors are editable.',
            'lightflow_environment.gradient.day_sky_gradient': 'Day',
            'lightflow_environment.time.noon': 'Noon',
            'lightflow_environment.time.sunset': 'Sunset',
            'lightflow_environment.time.midnight': 'Midnight',
            'lightflow_environment.time.sunrise': 'Sunrise',
            'lightflow_environment.gradient.quick_info': 'Select a color or double-click to add one. Diamonds adjust the blend. The scene previews this palette; its original time returns when you close the editor.',
            'lightflow_environment.gradient.sunrise_sky_gradient': 'Dawn',
            'lightflow_environment.gradient.sunset_sky_gradient': 'Sunset',
            'lightflow_environment.gradient.night_sky_gradient': 'Night',
            'lightflow_environment.gradient.ground': 'Ground',
            'lightflow_environment.gradient.horizon': 'Horizon',
            'lightflow_environment.gradient.zenith': 'Zenith',
            'lightflow_environment.group.time': 'Time & Cycle',
            'lightflow_environment.group.sky': 'Sky colors',
            'lightflow_environment.group.fog': 'Distance Fog',
            'lightflow_environment.group.distance_grade': 'Distance Color Grading',
            'lightflow_environment.action.distance_looks': 'Distance Look',
            'lightflow_environment.distance_look.air': 'Clear air · gentle separation',
            'lightflow_environment.distance_look.landscape': 'Landscape · layered depth',
            'lightflow_environment.distance_look.silhouette': 'Silhouette · dissolve distant masses',
            'lightflow_environment.info.distance_looks': 'Applies editable fog and grading values using the current sky and clock. Keeps your distances. Set Start beyond your subject, then adjust End to place the background. Requires Atmosphere and Lightflow surface materials for the complete look.',
            'lightflow_environment.info.distance_fog_art': 'Keep Start beyond the foreground you want to protect. End places the distant atmosphere. Advanced curves, sky blending, grading and texture require Atmosphere with Lightflow materials.',
            'lightflow_environment.field.distance_fog_curve': 'Fog Entry Curve',
            'lightflow_environment.info.distance_curve': '1 is neutral. Above 1 delays the effect to protect the middle ground; below 1 brings it forward. Start and End remain unchanged.',
            'lightflow_environment.field.distance_fog_sky_blend': 'Distant Sky Blend',
            'lightflow_environment.info.distance_sky_blend': 'Blend the far fog into the current sky gradient at each viewing height. Follows time and custom gradients; does not include sun discs, glare, stars or clouds. Available in the Overworld.',
            'lightflow_environment.field.distance_fog_noise': 'Atmosphere Texture',
            'lightflow_environment.field.distance_fog_noise_scale': 'Texture Size (scene units)',
            'lightflow_environment.info.distance_noise': 'Subtle world-anchored variation within the transition. 0 disables it. Stable in stills and tiles; this is surface haze, not a volume of clouds.',
            'lightflow_environment.field.distance_grade_follow_fog': 'Use Fog Distances',
            'lightflow_environment.info.distance_grade_range': 'Shares the fog Start and End so one distance adjustment protects the foreground for both effects. Disable to place grading independently.',
            'lightflow_environment.field.distance_grade_curve': 'Grading Entry Curve',
            'lightflow_environment.field.distance_grade_pivot_mode': 'Contrast Pivot',
            'lightflow_environment.field.distance_grade_pivot': 'Pivot Value',
            'lightflow_environment.info.distance_pivot': 'Value around which far contrast is compressed. Lower values preserve dark nights. Follow Sky Horizon adapts this value to the preset and clock.',
            'lightflow_environment.field.distance_grade_tint_mode': 'Far Tint',
            'lightflow_environment.group.celestial': 'Sun & Moon',
            'lightflow_environment.group.weather': 'Stars & Clouds',
            'lightflow_environment.group.bloom': 'Environment Bloom',
            'lightflow_environment.group.shadows': 'Shadows',
            'lightflow_environment.field.preset': 'Sky Model',
            'lightflow_environment.field.dimension': 'Dimension / Biome',
            'lightflow_environment.field.dimension_fog_mode': 'Dimension Fog',
            'lightflow_environment.option.dimension_fog_preset': 'Follow dimension',
            'lightflow_environment.field.sky_cycle_mode': 'Day Cycle',
            'lightflow_environment.field.moon_size': 'Moon Size',
            'lightflow_environment.option.cycle_reference': 'Reference cycle',
            'lightflow_environment.option.cycle_legacy': 'Legacy three-phase blend',
            'lightflow_environment.field.base_sky_model': 'Base Sky Model',
            'lightflow_environment.field.preset_name': 'Preset Name',
            'lightflow_environment.field.preset_icon': 'Preset Icon',
            'lightflow_environment.field.preset_color': 'Marker Color',
            'lightflow_environment.field.enabled': 'Render Environment',
            'lightflow_environment.field.time': 'Minecraft Time',
            'lightflow_environment.field.animate': 'Animate Day Cycle',
            'lightflow_environment.field.day_length': 'Day Cycle Duration (s)',
            'lightflow_environment.field.azimuth': 'Sun Path Rotation',
            'lightflow_environment.field.palette_mode': 'Sky Color Source',
            'lightflow_environment.option.palette_preset': 'Use Preset Palette',
            'lightflow_environment.option.palette_custom': 'Custom Palette',
            'lightflow_environment.field.day_sky_gradient': 'Day Sky Gradient',
            'lightflow_environment.field.sky_time_gradients_enabled': 'Use Timed Sky Gradients',
            'lightflow_environment.field.sky_time_select': 'Gradient Keyframe',
            'lightflow_environment.field.sky_time_tick': 'Keyframe Time (0–23999)',
            'lightflow_environment.field.sky_time_gradient': 'Sky Gradient at This Time',
            'lightflow_environment.field.sky_time_new': 'New Keyframe Time',
            'lightflow_environment.action.edit_timed_gradients': 'Edit Timed Gradients',
            'lightflow_environment.action.sky_time_add': 'Add Gradient at Time',
            'lightflow_environment.action.sky_time_remove': 'Delete Selected Keyframe',
            'lightflow_environment.dialog.sky_time_gradients': 'Sky Gradient Timeline',
            'lightflow_environment.info.sky_time_gradients': 'Create gradients at any Minecraft time (6000 = noon, 12000 = sunset). Keyframes blend smoothly, even across midnight. Turn off Use Timed Sky Gradients to restore the Day / Dawn / Sunset / Night blend without deleting your keyframes.',
            'lightflow_environment.field.day_sky_gradient.desc': 'Complete daytime gradient from lower sky / ground through the horizon to the zenith',
            'lightflow_environment.field.sunrise_sky_gradient': 'Dawn Sky Gradient',
            'lightflow_environment.field.sunrise_sky_gradient.desc': 'Complete lower-sky, horizon, and zenith gradient blended around dawn',
            'lightflow_environment.field.sunset_sky_gradient': 'Sunset Sky Gradient',
            'lightflow_environment.field.sunset_sky_gradient.desc': 'Complete lower-sky, horizon, and zenith gradient blended around sunset, independently of dawn',
            'lightflow_environment.field.night_sky_gradient': 'Night Sky Gradient',
            'lightflow_environment.field.night_sky_gradient.desc': 'Complete nighttime gradient from lower sky / ground through the horizon to the zenith',
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
            'lightflow_environment.field.cloud_top_color': 'Cloud Top Color',
            'lightflow_environment.field.cloud_sun_side_color': 'Cloud Sun-side Color',
            'lightflow_environment.field.cloud_shadow_side_color': 'Cloud Shadow-side Color',
            'lightflow_environment.field.cloud_bottom_color': 'Cloud Bottom Color',
            'lightflow_environment.field.cloud_edge_color': 'Cloud Bevel Highlight',
            'lightflow_environment.field.cloud_shadow_bevel_color': 'Cloud Bevel Shadow Color',
            'lightflow_environment.field.sky_intensity': 'Sky Brightness',
            'lightflow_environment.field.gradient_power': 'Sky Gradient Shape',
            'lightflow_environment.field.environment': 'Environment Influence',
            'lightflow_environment.field.ambient_fill_color_mode': 'Ambient Fill Colors',
            'lightflow_environment.option.ambient_fill_sky': 'Follow Sky',
            'lightflow_environment.option.ambient_fill_custom': 'Custom Colors',
            'lightflow_environment.field.ambient_fill_shape': 'Ambient Fill Shape',
            'lightflow_environment.option.ambient_fill_preset': 'Follow Preset',
            'lightflow_environment.option.ambient_fill_flat': 'Flat',
            'lightflow_environment.option.ambient_fill_hemisphere': 'Sky and Ground',
            'lightflow_environment.field.ambient_fill_sky_color': 'Sky / Flat Fill Color',
            'lightflow_environment.field.ambient_fill_ground_color': 'Ground Fill Color',
            'lightflow_environment.field.ambient_fill_day_multiplier': 'Day Fill Level',
            'lightflow_environment.field.ambient_fill_night_multiplier': 'Night Fill Level',
            'lightflow_environment.field.distance_fog_enabled': 'Minecraft Distance Fog',
            'lightflow_environment.field.distance_fog_color_mode': 'Fog Color Source',
            'lightflow_environment.option.fog_color_sky': 'Follow Sky Horizon',
            'lightflow_environment.option.fog_color_time': 'Custom Colors by Time',
            'lightflow_environment.option.fog_color_fixed': 'Fixed Color',
            'lightflow_environment.field.distance_fog_fixed_color': 'Fixed Fog Color',
            'lightflow_environment.field.distance_fog_near_color': 'Near Gradient Color',
            'lightflow_environment.field.distance_fog_day_color': 'Day Fog Color',
            'lightflow_environment.field.distance_fog_sunrise_color': 'Sunrise / Sunset Fog Color',
            'lightflow_environment.field.distance_fog_night_color': 'Night Fog Color',
            'lightflow_environment.field.distance_fog_start': 'Start Distance',
            'lightflow_environment.field.distance_fog_end': 'End Distance',
            'lightflow_environment.field.distance_fog_smoothness': 'Transition Smoothness',
            'lightflow_environment.field.distance_fog_gradient': 'Color Gradient Strength',
            'lightflow_environment.field.distance_fog_dither': 'Dither',
            'lightflow_environment.field.distance_fog_max_opacity': 'Maximum Opacity',
            'lightflow_environment.field.distance_fog_sync_background': 'Match Background Color',
            'lightflow_environment.field.distance_grade_enabled': 'Distance Color Grading',
            'lightflow_environment.field.distance_grade_start': 'Grading Start',
            'lightflow_environment.field.distance_grade_end': 'Grading End',
            'lightflow_environment.field.distance_grade_saturation': 'Far Saturation',
            'lightflow_environment.field.distance_grade_contrast': 'Far Contrast',
            'lightflow_environment.field.distance_grade_tint': 'Far Tint',
            'lightflow_environment.field.distance_grade_tint_strength': 'Far Tint Strength',
            'lightflow_environment.field.sun_enabled': 'Sun / Moon Lighting',
            'lightflow_environment.field.sun_intensity': 'Sun Intensity',
            'lightflow_environment.field.sun_light_color_mode': 'Sunlight Color',
            'lightflow_environment.option.sun_light_follow_disc': 'Follow Sun Disc',
            'lightflow_environment.option.sun_light_time_colors': 'Day to Twilight',
            'lightflow_environment.field.sun_light_day_color': 'Daylight Color',
            'lightflow_environment.field.sun_light_twilight_color': 'Twilight Light Color',
            'lightflow_environment.field.moon_intensity': 'Moon Intensity',
            'lightflow_environment.field.moon_light_color_mode': 'Moonlight Color',
            'lightflow_environment.option.moon_light_follow_disc': 'Follow Moon Disc',
            'lightflow_environment.option.moon_light_custom': 'Custom Color',
            'lightflow_environment.field.moon_light_custom_color': 'Moonlight Color',
            'lightflow_environment.field.celestial_size': 'Sun Size',
            'lightflow_environment.field.moon_phase': 'Moon Phase',
            'lightflow_environment.option.moon_full': 'Full Moon',
            'lightflow_environment.option.moon_waning_gibbous': 'Waning Gibbous',
            'lightflow_environment.option.moon_third_quarter': 'Third Quarter',
            'lightflow_environment.option.moon_waning_crescent': 'Waning Crescent',
            'lightflow_environment.option.moon_new': 'New Moon',
            'lightflow_environment.option.moon_waxing_crescent': 'Waxing Crescent',
            'lightflow_environment.option.moon_first_quarter': 'First Quarter',
            'lightflow_environment.option.moon_waxing_gibbous': 'Waxing Gibbous',
            'lightflow_environment.field.sun_mode': 'Sun Appearance',
            'lightflow_environment.field.moon_mode': 'Moon Appearance',
            'lightflow_environment.field.sun_blend_mode': 'Sun Blending',
            'lightflow_environment.field.sun_opacity': 'Sun Opacity',
            'lightflow_environment.field.moon_blend_mode': 'Moon Blending',
            'lightflow_environment.field.moon_opacity': 'Moon Opacity',
            'lightflow_environment.field.sun_texture': 'Sun Texture',
            'lightflow_environment.field.moon_texture': 'Moon Texture',
            'lightflow_environment.field.moon_texture_layout': 'Moon Texture Layout',
            'lightflow_environment.field.moon_atlas_columns': 'Moon Atlas Columns',
            'lightflow_environment.field.moon_atlas_rows': 'Moon Atlas Rows',
            'lightflow_environment.field.moon_phase_offset': 'Moon Phase Offset',
            'lightflow_environment.field.sun_horizon_scale': 'Sunset Sun Size',
            'lightflow_environment.field.sun_gaze_scale': 'Direct-View Sun Size',
            'lightflow_environment.field.sun_glare': 'Sun Glare',
            'lightflow_environment.field.lens_flare_enabled': 'Minecraft Lens Flare',
            'lightflow_environment.field.lens_flare_strength': 'Lens Flare Strength',
            'lightflow_environment.field.lens_flare_scale': 'Lens Flare Size',
            'lightflow_environment.field.cloud_translucency': 'Cloud Light Transmission',
            'lightflow_environment.field.sunset_directional_glow': 'Directional Sunset Glow',
            'lightflow_environment.option.celestial_vanilla': 'Minecraft Texture',
            'lightflow_environment.option.celestial_texture': 'Project Texture',
            'lightflow_environment.option.celestial_blend_preset': 'Preset (Original)',
            'lightflow_environment.option.celestial_blend_alpha': 'Alpha Blend',
            'lightflow_environment.option.celestial_blend_additive': 'Additive',
            'lightflow_environment.option.celestial_blend_multiply': 'Multiply',
            'lightflow_environment.option.moon_atlas': 'Phase Atlas',
            'lightflow_environment.option.moon_single': 'Single Texture',
            'lightflow_environment.option.hidden': 'Hidden',
            'lightflow_environment.option.texture_none': 'Select a project texture',
            'lightflow_environment.field.stars': 'Stars',
            'lightflow_environment.field.star_brightness': 'Star Brightness',
            'lightflow_environment.field.star_density': 'Star Density',
            'lightflow_environment.field.clouds': 'Minecraft Clouds',
            'lightflow_environment.field.cloud_time_profiles_enabled': 'Use Timed Cloud Profiles',
            'lightflow_environment.field.cloud_time_frame': 'Cloud Keyframe',
            'lightflow_environment.field.cloud_time_tick': 'Keyframe Time (0–23999)',
            'lightflow_environment.field.cloud_time_section': 'Edit Cloud Look',
            'lightflow_environment.field.cloud_time_new': 'New Keyframe Time',
            'lightflow_environment.option.cloud_time_appearance': 'Coverage & Appearance',
            'lightflow_environment.option.cloud_time_colors': 'Cloud Colors',
            'lightflow_environment.option.cloud_time_lighting': 'Lighting & Fog',
            'lightflow_environment.option.cloud_time_edges': 'Gradient & Bevel',
            'lightflow_environment.option.cloud_time_light_only': 'Lighting',
            'lightflow_environment.option.cloud_time_fog': 'Distance Fog',
            'lightflow_environment.option.cloud_time_advanced': 'Advanced Material',
            'lightflow_environment.option.gradient_visible': 'Visible',
            'lightflow_environment.option.gradient_hidden': 'Hidden',
            'lightflow_environment.field.cloud_gradient_hide': 'Hide Gradient',
            'lightflow_environment.info.cloud_effect_inactive': 'Thickness 0 or Hide Gradient 1 disables the gradient. Edge light also needs scattering above 0. Hidden controls keep their saved values.',
            'lightflow_environment.action.cloud_time_profiles': 'Edit Timed Cloud Profiles',
            'lightflow_environment.action.cloud_time_add': 'Add Cloud Profile at Time',
            'lightflow_environment.action.cloud_time_remove': 'Delete Selected Cloud Profile',
            'lightflow_environment.dialog.cloud_time_profiles': 'Cloud Appearance Timeline',
            'lightflow_environment.info.cloud_time_profiles': 'Create cloud looks for day, sunset and night. They blend smoothly across midnight. Texture, motion, scale and structure remain shared to avoid jumps. Disable Timed Cloud Profiles to return to a fixed appearance.',
            'lightflow_environment.field.cloud_mode': 'Cloud Source',
            'lightflow_environment.field.cloud_style': 'Cloud Shading',
            'lightflow_environment.field.cloud_palette_mode': 'Cloud Palette',
            'lightflow_environment.option.cloud_palette_preset': 'Rendercraft Preset Palette',
            'lightflow_environment.option.cloud_palette_custom': 'Custom Cloud Palette',
            'lightflow_environment.field.cloud_texture': 'Cloud Project Texture',
            'lightflow_environment.option.cloud_procedural': 'Procedural Blocks',
            'lightflow_environment.option.cloud_vanilla': 'Vanilla (local resources)',
            'lightflow_environment.resources.title': "Vanilla resources",
            'lightflow_environment.resources.help': "Vanilla images are prepared automatically when Environment is first enabled: local cache, an already configured Terrain pack, or a direct download from Mojang. Downloading is subject to the Minecraft EULA. Images are cached on this device, separately from projects. Local ZIP/MCPACK/JAR import is an advanced option; it requires the classic 4 x 2 moon atlas.",
            'lightflow_environment.resources.loaded': "Local resources loaded",
            'lightflow_environment.resources.missing': "Vanilla resources are unavailable. Check your connection; retry or choose a local pack in View > Vanilla resources.",
            'lightflow_environment.resources.session': "this session only",
            'lightflow_environment.resources.retry': 'Prepare Vanilla resources',
            'lightflow_environment.resources.import': "Choose local pack or JAR",
            'lightflow_environment.resources.remove': "Clear local resources",
            'lightflow_environment.option.cloud_texture': 'Project Texture',
            'lightflow_environment.option.cloud_style_vanilla': 'Vanilla Flat Faces',
            'lightflow_environment.option.cloud_style_rendercraft': 'Rendercraft Beveled Faces',
            'lightflow_environment.option.cloud_style_vibrant': 'Vibrant Visuals Sculpted Faces',
            'lightflow_environment.field.cloud_coverage': 'Cloud Coverage',
            'lightflow_environment.field.cloud_opacity': 'Cloud Opacity',
            'lightflow_environment.field.cloud_speed': 'Cloud Speed',
            'lightflow_environment.field.cloud_paused': 'Pause clouds here',
            'lightflow_environment.field.cloud_offset_x': 'Cloud Offset X',
            'lightflow_environment.field.cloud_offset_y': 'Cloud Offset Y (horizontal)',
            'lightflow_environment.field.cloud_scale': 'Cloud Scale',
            'lightflow_environment.field.cloud_direction': 'Cloud Direction',
            'lightflow_environment.field.cloud_contrast': 'Cloud Contrast',
            'lightflow_environment.field.cloud_brightness': 'Cloud Brightness',
            'lightflow_environment.field.cloud_height': 'Cloud Layer Height',
            'lightflow_environment.field.cloud_thickness': 'Cloud Thickness',
            'lightflow_environment.field.cloud_extrusion': '3D Cloud Extrusion',
            'lightflow_environment.field.cloud_bevel_width': 'Cloud Bevel Width',
            'lightflow_environment.field.cloud_bevel_enabled': 'Enable Bevel',
            'lightflow_environment.field.cloud_scattering_strength': 'Scattering Intensity',
            'lightflow_environment.info.cloud_scattering_strength': 'Scales optical edge lighting and directional scattering. Zero removes these additions; diffuse lighting remains.',
            'lightflow_environment.field.cloud_gradient_thickness': 'Edge Gradient Width (cells)',
            'lightflow_environment.info.cloud_gradient_thickness': 'Visible width measured inward from the rectangular cloud contour, in cloud cells. 0 removes the band; 1 spans one cell. Independent of bevel and layer thickness.',
            'lightflow_environment.field.cloud_gradient_alpha': 'Edge Gradient Fade',
            'lightflow_environment.info.cloud_gradient_alpha': '0: full edge gradient. 1: no edge gradient. Does not hide the cloud or change its global opacity.',
            'lightflow_environment.field.cloud_view_response': 'View / Light Response',
            'lightflow_environment.info.cloud_view_response': '0: unchanged. 1: front-facing cloud faces have less soft glow and transmission; grazing faces scatter more light, especially toward the sun or moon.',
            'lightflow_environment.field.cloud_edge_hardness': 'Edge Hardness',
            'lightflow_environment.info.cloud_edge_hardness': '0: soft feather. 1: hard rectangular transition with pixel antialiasing. Independent of bevel.',
            'lightflow_environment.field.cloud_scattering_size': 'Edge Optical Path',
            'lightflow_environment.info.cloud_scattering_size': 'Advanced multiplier for optical travel inside the edge band. Changes absorption, not the gradient width.',
            'lightflow_environment.field.cloud_optical_thickness': 'Optical Thickness',
            'lightflow_environment.info.cloud_optical_thickness': 'Multiplies absorption along view and light paths. Does not change geometric layer thickness.',
            'lightflow_environment.field.cloud_phase_anisotropy': 'Forward Scattering',
            'lightflow_environment.info.cloud_phase_anisotropy': 'Controls how strongly clouds scatter light toward the light-facing view direction.',
            'lightflow_environment.field.cloud_density_variation': 'Interior Density Variation',
            'lightflow_environment.info.cloud_density_variation': 'Deterministic interior density variation anchored to cloud space. Zero gives uniform interior density.',
            'lightflow_environment.field.cloud_bevel_smooth': 'Smooth Bevel (smoothstep)',
            'lightflow_environment.field.cloud_bevel_softness': 'Bevel Feather',
            'lightflow_environment.field.cloud_bevel_roundness': 'Bevel Roundness',
            'lightflow_environment.field.cloud_bevel_strength': 'Bevel Normal Strength',
            'lightflow_environment.field.cloud_bevel_distance_fade': 'Shrink Bevel with Distance',
            'lightflow_environment.field.cloud_bevel_distance_min_scale': 'Distant Bevel Minimum',
            'lightflow_environment.field.cloud_edge_strength': 'Exterior Edge Light',
            'lightflow_environment.field.cloud_shadow_bevel_strength': 'Bevel Shadow Tint',
            'lightflow_environment.field.cloud_lighting_mode': 'Cloud Color Lighting',
            'lightflow_environment.option.cloud_lighting_palette': 'Palette Only',
            'lightflow_environment.option.cloud_lighting_sky': 'Sky Color',
            'lightflow_environment.option.cloud_lighting_mixed': 'Palette + Sky Light',
            'lightflow_environment.field.cloud_environment_influence': 'Environment Color Influence',
            'lightflow_environment.info.cloud_environment_influence': '0 keeps your cloud palette independent of sky, sun, time and fog color; 1 keeps the full environment look. Set the face colors to white for neutral clouds. Opacity still reveals the sky behind clouds.',
            'lightflow_environment.field.cloud_time_tint_strength': 'Time of Day Influence',
            'lightflow_environment.info.cloud_time_tint_strength': 'Blend the day, sunset and night cloud lighting from 0 (fixed palette and brightness) to 1 (full cycle). Sky, sun and fog have separate controls.',
            'lightflow_environment.field.cloud_sky_tint_strength': 'Sky Color Influence',
            'lightflow_environment.field.cloud_sun_tint_strength': 'Sun Color Influence',
            'lightflow_environment.field.cloud_fog_enabled': 'Cloud Distance Fog',
            'lightflow_environment.field.cloud_fog_color_mode': 'Cloud Fog Color Source',
            'lightflow_environment.option.cloud_fog_sky': 'Use Current Sky Gradient',
            'lightflow_environment.option.cloud_fog_custom': 'Custom Fog Color',
            'lightflow_environment.field.cloud_fog_color': 'Custom Cloud Fog Color',
            'lightflow_environment.field.cloud_fog_strength': 'Cloud Fog Strength',
            'lightflow_environment.field.cloud_fog_start': 'Cloud Fog Start Distance',
            'lightflow_environment.field.cloud_fog_end': 'Cloud Fog End Distance',
            'lightflow_environment.field.cloud_density': 'Cloud Optical Density',
            'lightflow_environment.field.cloud_absorption': 'Cloud Light Absorption',
            'lightflow_environment.field.environment_bloom_enabled': 'Use Environment Bloom',
            'lightflow_environment.field.bloom_threshold': 'Bloom Threshold',
            'lightflow_environment.field.bloom_soft_knee': 'Bloom Soft Knee',
            'lightflow_environment.field.bloom_strength': 'Bloom Strength',
            'lightflow_environment.field.bloom_core_strength': 'Bloom Core Strength',
            'lightflow_environment.field.bloom_core_radius': 'Bloom Core Radius',
            'lightflow_environment.field.bloom_halo_strength': 'Bloom Halo Strength',
            'lightflow_environment.field.bloom_halo_radius': 'Bloom Halo Radius',
            'lightflow_environment.field.bloom_hdr_strength': 'HDR Bloom Contribution',
            'lightflow_environment.field.bloom_emissive_strength': 'Emissive Bloom Contribution',
            'lightflow_environment.field.bloom_occlusion': 'Bloom Occlusion',
            'lightflow_environment.field.sun_bloom_contribution': 'Sun Bloom Contribution',
            'lightflow_environment.field.moon_bloom_contribution': 'Moon Bloom Contribution',
            'lightflow_environment.field.star_bloom_contribution': 'Star Bloom Contribution',
            'lightflow_environment.field.cloud_bloom_contribution': 'Cloud Bloom Contribution',
            'lightflow_environment.field.cast_shadows': 'Cast Sun Shadows',
            'lightflow_environment.field.shadows_disabled.desc': 'Enable Sun / Moon Light to use environment shadows.',
            'lightflow_environment.field.shadow_auto_fit': 'Fixed Shadow Region',
            'lightflow_environment.field.show_shadow_gizmo': 'Show Editable Shadow Box',
            'lightflow_environment.field.shadow_area': 'Shadow Capture Area',
            'lightflow_environment.field.shadow_resolution': 'Shadow Resolution',
            'lightflow_environment.field.shadow_camera_quality': 'Camera Shadow Detail',
            'lightflow_environment.field.shadow_camera_quality.desc': 'Two camera-centred detail maps refine the main directional light. Balanced caps the near map at 2048; High at 4096 in preview and 8192 in Studio. Other lights keep their authored maps.',
            'lightflow_environment.field.shadow_camera_distance': 'Camera Detail Distance',
            'lightflow_environment.field.shadow_camera_distance.desc': 'Depth covered from the nearest part of the scene. Empty space before the scene does not consume detail. A shorter distance concentrates more texels nearby. The original box retains far coverage and the full caster depth.',
            'lightflow_environment.option.camera_shadow.off': 'Off — original map',
            'lightflow_environment.option.camera_shadow.balanced': 'Balanced',
            'lightflow_environment.option.camera_shadow.high': 'High',
            'lightflow_environment.field.shadow_softness_mode': "Shadow Style",
            'lightflow_environment.field.shadow_softness_mode.desc': "Crisp: sharp antialiased edges. Artistic: constant blur. Distance: physically growing penumbra. Classic: legacy shadow filtering.",
            'lightflow_environment.shadow_mode.hard': "Crisp (AA)",
            'lightflow_environment.shadow_mode.artistic': "Artistic",
            'lightflow_environment.shadow_mode.distance': "Distance",
            'lightflow_environment.shadow_mode.legacy': "Classic",
            'lightflow_environment.field.shadow_blur': "Blur Radius",
            'lightflow_environment.field.shadow_blur.desc': "Constant blur, including contacts. 0 = hard; 8 = soft; 32–64 = broad. Preserves size across resolutions.",
            'lightflow_environment.field.shadow_softness': 'Sun Angular Size',
            'lightflow_environment.field.shadow_softness.desc': 'Angular diameter of the sun in degrees. Larger values widen penumbrae as blocker-receiver distance grows; 0 keeps hard shadows.',
            'lightflow_environment.field.studio_shadow_resolution': 'Studio Shadow Quality',
            'lightflow_environment.field.studio_shadow_resolution.desc': 'Shadow map resolution used only by Studio Render. Same as Preview preserves the viewport quality.',
            'lightflow_environment.option.studio_shadow.same': 'Same as Preview',
            'lightflow_environment.field.shadow_near': 'Shadow Near Plane',
            'lightflow_environment.field.shadow_far': 'Shadow Far Plane',
            'lightflow_environment.field.shadow_bias': 'Shadow Bias',
            'lightflow_environment.field.normal_bias_auto': 'Automatic Normal Bias',
            'lightflow_environment.field.normal_bias': 'Shadow Normal Bias',
            'lightflow_environment.field.pixelated_shadows': 'Vibrant Visuals Pixel Shadows',
            'lightflow_environment.field.pixel_shadow_steps': 'Shadow Tone Steps',
            'lightflow_environment.field.pixel_shadow_scale': 'Shadow Pixel Size',
            'lightflow_environment.undo.edit': 'Edit environment',
            'lightflow_environment.undo.edit_gradient': 'Edit sky gradient',
            'lightflow_environment.undo.select_preset': 'Select sky preset',
            'lightflow_environment.undo.create_preset': 'Create sky preset',
            'lightflow_environment.undo.duplicate_preset': 'Duplicate sky preset',
            'lightflow_environment.undo.rename_preset': 'Rename sky preset',
            'lightflow_environment.undo.change_preset_icon': 'Change sky preset icon',
            'lightflow_environment.undo.change_preset_color': 'Change sky preset color',
            'lightflow_environment.undo.change_base_sky_model': 'Change base sky model',
            'lightflow_environment.undo.import_preset': 'Import sky preset',
            'lightflow_environment.undo.delete_preset': 'Delete sky preset',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requires Light Manager 1.8.0 or newer.',
            'lightflow_environment.field.shadow_scene_fit': 'Automatically cover the whole scene',
            'lightflow_environment.field.shadow_region_locked': 'Lock shadow region in world space',
            'lightflow_environment.info.quick_preset': 'Time, cycle speed and quick lighting or shadow changes affect this project. Advanced edits create an editable copy.',
            'lightflow_environment.info.native_preset_locked': 'Global Sky Preset · Quick Adjustments',
            'lightflow_environment.info.environment_disabled': 'Enable Render Environment to edit this control.',
            'lightflow_environment.info.custom_preset_editable': 'Custom Sky Preset · Editable',
            'lightflow_environment.info.no_custom_presets': 'No custom sky presets yet',
            'lightflow_environment.message.native_preset_locked': 'Native sky presets cannot be edited.',
            'lightflow_environment.message.create_copy_to_edit': 'This is a native sky preset. Create an editable copy to customize it.',
            'lightflow_environment.message.delete_preset_confirm': 'Delete the sky preset "{name}"? This cannot be undone.',
            'lightflow_environment.message.preset_duplicated': 'Sky preset duplicated',
            'lightflow_environment.message.editable_copy_created': 'Editable sky copy created. Your global preset is preserved.',
            'lightflow_environment.message.preset_import_failed': 'No valid sky preset could be imported',
            'lightflow_environment.message.preset_imported': 'Sky preset imported',
            'lightflow_environment.message.fit_selection': 'Environment shadows fitted to the selected geometry.',
            'lightflow_environment.message.fit_scene': 'Environment shadows fitted to all scene geometry.',
            'lightflow_environment.message.fit_no_geometry': 'No geometry is available to fit the environment shadow region.'
        };
        Language.addTranslations('en', translations);
        Language.addTranslations('es', Object.assign({}, translations, {
            'lightflow_environment.plugin.title': 'Entorno Lightflow',
            'lightflow_environment.panel.title': 'ENTORNO',
            'lightflow_environment.panel.disabled_hint': 'Activa Renderizar entorno para editar.',
        'lightflow_environment.panel.category_sky': 'Cielo',
        'lightflow_environment.field.frame_clock': 'Hora seleccionada',
        'lightflow_environment.preview.coverage': 'Cobertura',
        'lightflow_environment.info.fixed_sky_phase': 'Esta fase base tiene una hora fija y no se puede eliminar. Edita sus colores o añade otro momento a la hora que necesites.',
        'lightflow_environment.preview.opacity': 'Opacidad',
        'lightflow_environment.info.invalid_clock': 'Escribe una hora válida: HH:MM (00:00–23:59), o ticks de 0 a 23999.',
        'lightflow_environment.field.add_clock': 'Crear a las',
        'lightflow_environment.info.clock_input': 'Escribe HH:MM (reloj de 24 horas), o ticks exactos de Minecraft (0–23999). Si la hora existe se selecciona, sin duplicarla.',
        'lightflow_environment.group.ambient': 'Luz ambiental',
        'lightflow_environment.info.timeline_preview': 'Vista previa a la hora seleccionada. Al cerrar se restaura el reloj de la escena; los cambios se mezclan suavemente entre momentos.',
        'lightflow_environment.group.sun': 'Sol',
        'lightflow_environment.group.appearance': 'Aspecto',
        'lightflow_environment.group.sun_glow': 'Resplandor y destellos',
        'lightflow_environment.group.moon': 'Luna',
        'lightflow_environment.group.cloud_motion': 'Movimiento',
        'lightflow_environment.group.cloud_palette': 'Color y contraste',
        'lightflow_environment.group.cloud_lighting': 'Luz y volumen',
        'lightflow_environment.group.cloud_detail': 'Bordes y bisel',
        'lightflow_environment.panel.category_atmosphere': 'Atmósfera',
        'lightflow_environment.panel.category_lighting': 'Luz',
            'lightflow_environment.info.environment_disabled': 'Activa Renderizar entorno para editar este control.',
            'lightflow_environment.action.open': 'Compositor de entorno...',
            'lightflow_environment.action.open.desc': 'Edita el cielo, la hora, el sol, la luna, las nubes, la luz ambiental y las sombras de Minecraft.',
            'lightflow_environment.action.manage_presets': 'Gestionar presets de cielo',
            'lightflow_environment.action.create_preset': 'Nuevo preset de cielo...',
            'lightflow_environment.action.create_editable_copy': 'Crear copia editable',
            'lightflow_environment.action.import_preset': 'Importar preset de cielo',
            'lightflow_environment.action.export_preset': 'Exportar preset de cielo',
            'lightflow_environment.action.duplicate_preset': 'Duplicar',
            'lightflow_environment.action.delete_preset': 'Eliminar preset de cielo',
            'lightflow_environment.action.rename_preset': 'Renombrar...',
            'lightflow_environment.action.change_preset_icon': 'Cambiar icono',
            'lightflow_environment.action.other_icon': 'Otro icono...',
            'lightflow_environment.action.change_preset_color': 'Color del marcador',
            'lightflow_environment.action.change_base_sky_model': 'Cambiar modelo de cielo base...',
            'lightflow_environment.action.fit_shadow_region': 'Ajustar sombras a selección / escena',
            'lightflow_environment.action.fit_shadow_region.desc': 'Ajusta la región de sombras a la selección o a toda la escena si no hay nada seleccionado.',
            'lightflow_environment.dialog.title': 'Compositor de entorno de Minecraft',
            'lightflow_environment.dialog.gradient_title': 'Editor de gradientes del cielo',
            'lightflow_environment.dialog.create_preset': 'Nuevo preset de cielo',
            'lightflow_environment.dialog.rename_preset': 'Renombrar preset de cielo',
            'lightflow_environment.dialog.change_preset_icon': 'Cambiar icono del preset',
            'lightflow_environment.dialog.change_base_sky_model': 'Cambiar modelo de cielo base',
            'lightflow_environment.action.edit_gradients': 'Editar degradados del cielo…',
            'lightflow_environment.action.edit_gradients.desc': 'Edita los degradados del cielo de día, amanecer, atardecer y noche.',
            'lightflow_environment.gradient.info': 'Doble clic en la barra para añadir un color. Arrastra los puntos o escribe su posición en porcentaje. Los diamantes ajustan la mezcla. Usa Arriba/Abajo para seleccionar un punto, Izquierda/Derecha para afinar y Mayús para pasos mayores. La posición de los extremos es fija; sus colores se pueden editar.',
            'lightflow_environment.gradient.day_sky_gradient': 'Día',
            'lightflow_environment.time.noon': 'Mediodía',
            'lightflow_environment.time.sunset': 'Atardecer',
            'lightflow_environment.time.midnight': 'Medianoche',
            'lightflow_environment.time.sunrise': 'Amanecer',
            'lightflow_environment.gradient.quick_info': 'Selecciona un color o haz doble clic para añadirlo. Los diamantes ajustan la mezcla. La escena muestra esta paleta; su hora original se restaura al cerrar el editor.',
            'lightflow_environment.gradient.sunrise_sky_gradient': 'Amanecer',
            'lightflow_environment.gradient.sunset_sky_gradient': 'Atardecer',
            'lightflow_environment.gradient.night_sky_gradient': 'Noche',
            'lightflow_environment.gradient.ground': 'Suelo',
            'lightflow_environment.gradient.horizon': 'Horizonte',
            'lightflow_environment.gradient.zenith': 'Cénit',
            'lightflow_environment.group.time': 'Hora y ciclo',
            'lightflow_environment.group.sky': 'Colores del cielo',
            'lightflow_environment.group.fog': 'Niebla por distancia',
            'lightflow_environment.group.distance_grade': 'Color por distancia',
            'lightflow_environment.action.distance_looks': 'Puntos de partida',
            'lightflow_environment.distance_look.air': 'Aire claro · separación suave',
            'lightflow_environment.distance_look.landscape': 'Paisaje · profundidad por planos',
            'lightflow_environment.distance_look.silhouette': 'Silueta · disolver masas lejanas',
            'lightflow_environment.info.distance_looks': 'Aplica valores editables de niebla y corrección con el cielo y la hora actuales. Conserva tus distancias. Coloca Inicio después del sujeto y ajusta Fin para situar el fondo. El resultado completo requiere Atmosphere y materiales Lightflow.',
            'lightflow_environment.info.distance_fog_art': 'Coloca Inicio después del primer plano que quieres proteger. Fin sitúa la atmósfera lejana. Las curvas, el fundido al cielo, la corrección y la textura requieren Atmosphere con materiales Lightflow.',
            'lightflow_environment.field.distance_fog_curve': 'Curva de entrada de niebla',
            'lightflow_environment.info.distance_curve': '1 es neutro. Más de 1 retrasa el efecto para proteger el plano medio; menos de 1 lo adelanta. Inicio y Fin se mantienen.',
            'lightflow_environment.field.distance_fog_sky_blend': 'Fundido lejano con el cielo',
            'lightflow_environment.info.distance_sky_blend': 'Acerca la niebla al degradado actual del cielo según la altura de la mirada. Sigue la hora y los degradados personalizados; excluye discos solares, resplandor, estrellas y nubes. Disponible en Overworld.',
            'lightflow_environment.field.distance_fog_noise': 'Textura de la atmósfera',
            'lightflow_environment.field.distance_fog_noise_scale': 'Tamaño de textura (unidades de escena)',
            'lightflow_environment.info.distance_noise': 'Variación sutil anclada al mundo dentro de la transición. 0 la desactiva. Estable en imágenes y tiles; es bruma de superficie, no un volumen de nubes.',
            'lightflow_environment.field.distance_grade_follow_fog': 'Compartir distancias',
            'lightflow_environment.info.distance_grade_range': 'Comparte Inicio y Fin con la niebla: una sola distancia protege el primer plano de ambos efectos. Desactívalo para situar la corrección por separado.',
            'lightflow_environment.field.distance_grade_curve': 'Curva de entrada de corrección',
            'lightflow_environment.field.distance_grade_pivot_mode': 'Pivote',
            'lightflow_environment.field.distance_grade_pivot': 'Valor del pivote',
            'lightflow_environment.info.distance_pivot': 'Valor hacia el que se comprime el contraste lejano. Valores bajos conservan noches oscuras. Seguir el horizonte adapta el pivote al preset y la hora.',
            'lightflow_environment.field.distance_grade_tint_mode': 'Tinte',
            'lightflow_environment.group.celestial': 'Sol y luna',
            'lightflow_environment.group.weather': 'Estrellas y nubes',
            'lightflow_environment.group.bloom': 'Bloom del entorno',
            'lightflow_environment.group.shadows': 'Sombras',
            'lightflow_environment.field.preset': 'Modelo de cielo',
            'lightflow_environment.field.dimension': 'Dimensión / Bioma',
            'lightflow_environment.field.dimension_fog_mode': 'Niebla de la dimensión',
            'lightflow_environment.option.dimension_fog_preset': 'Seguir dimensión',
            'lightflow_environment.field.sky_cycle_mode': 'Ciclo del día',
            'lightflow_environment.field.moon_size': 'Tamaño de la luna',
            'lightflow_environment.option.cycle_reference': 'Ciclo de referencia',
            'lightflow_environment.option.cycle_legacy': 'Mezcla anterior de tres fases',
            'lightflow_environment.field.base_sky_model': 'Modelo de cielo base',
            'lightflow_environment.field.preset_name': 'Nombre del preset',
            'lightflow_environment.field.preset_icon': 'Icono del preset',
            'lightflow_environment.field.preset_color': 'Color del marcador',
            'lightflow_environment.field.enabled': 'Renderizar entorno',
            'lightflow_environment.field.time': 'Hora de Minecraft',
            'lightflow_environment.field.animate': 'Animar ciclo del día',
            'lightflow_environment.field.day_length': 'Duración del ciclo (s)',
            'lightflow_environment.field.azimuth': 'Rotación de la trayectoria solar',
            'lightflow_environment.field.palette_mode': 'Origen de colores del cielo',
            'lightflow_environment.option.palette_preset': 'Usar paleta del preset',
            'lightflow_environment.option.palette_custom': 'Paleta personalizada',
            'lightflow_environment.field.day_sky_gradient': 'Degradado diurno',
            'lightflow_environment.field.sky_time_gradients_enabled': 'Usar gradientes por hora',
            'lightflow_environment.field.sky_time_select': 'Clave del degradado',
            'lightflow_environment.field.sky_time_tick': 'Hora de la clave (0–23999)',
            'lightflow_environment.field.sky_time_gradient': 'Degradado a esta hora',
            'lightflow_environment.field.sky_time_new': 'Nueva hora clave',
            'lightflow_environment.action.edit_timed_gradients': 'Editar gradientes por hora',
            'lightflow_environment.action.sky_time_add': 'Añadir gradiente a esta hora',
            'lightflow_environment.action.sky_time_remove': 'Eliminar clave seleccionada',
            'lightflow_environment.dialog.sky_time_gradients': 'Línea de tiempo del cielo',
            'lightflow_environment.info.sky_time_gradients': 'Añade degradados a cualquier hora de Minecraft (6000 = mediodía; 12000 = atardecer). Las claves se mezclan suavemente, incluso al cruzar medianoche. Desactiva los degradados por hora para volver a Día / Amanecer / Atardecer / Noche sin perder las claves.',
            'lightflow_environment.field.day_sky_gradient.desc': 'Gradiente diurno completo desde el cielo inferior / suelo, pasando por el horizonte, hasta el cénit',
            'lightflow_environment.field.sunrise_sky_gradient': 'Degradado del amanecer',
            'lightflow_environment.field.sunrise_sky_gradient.desc': 'Gradiente completo de suelo, horizonte y cénit mezclado durante el amanecer',
            'lightflow_environment.field.sunset_sky_gradient': 'Degradado del atardecer',
            'lightflow_environment.field.sunset_sky_gradient.desc': 'Gradiente completo de suelo, horizonte y cénit mezclado durante el atardecer, independiente del amanecer',
            'lightflow_environment.field.night_sky_gradient': 'Degradado nocturno',
            'lightflow_environment.field.night_sky_gradient.desc': 'Gradiente nocturno completo desde el cielo inferior / suelo, pasando por el horizonte, hasta el cénit',
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
            'lightflow_environment.field.cloud_top_color': 'Color superior de las nubes',
            'lightflow_environment.field.cloud_sun_side_color': 'Cara iluminada de las nubes',
            'lightflow_environment.field.cloud_shadow_side_color': 'Cara en sombra de las nubes',
            'lightflow_environment.field.cloud_bottom_color': 'Color inferior de las nubes',
            'lightflow_environment.field.cloud_edge_color': 'Brillo del bisel de nubes',
            'lightflow_environment.field.cloud_shadow_bevel_color': 'Sombra del bisel',
            'lightflow_environment.field.sky_intensity': 'Brillo del cielo',
            'lightflow_environment.field.gradient_power': 'Curva del degradado',
            'lightflow_environment.field.environment': 'Influencia del entorno',
            'lightflow_environment.field.ambient_fill_color_mode': 'Colores de luz ambiente',
            'lightflow_environment.option.ambient_fill_sky': 'Seguir el cielo',
            'lightflow_environment.option.ambient_fill_custom': 'Colores personalizados',
            'lightflow_environment.field.ambient_fill_shape': 'Distribución de luz ambiental',
            'lightflow_environment.option.ambient_fill_preset': 'Seguir el preset',
            'lightflow_environment.option.ambient_fill_flat': 'Uniforme',
            'lightflow_environment.option.ambient_fill_hemisphere': 'Cielo y suelo',
            'lightflow_environment.field.ambient_fill_sky_color': 'Luz del cielo / uniforme',
            'lightflow_environment.field.ambient_fill_ground_color': 'Color de luz del suelo',
            'lightflow_environment.field.ambient_fill_day_multiplier': 'Luz ambiental diurna',
            'lightflow_environment.field.ambient_fill_night_multiplier': 'Luz ambiental nocturna',
            'lightflow_environment.field.distance_fog_enabled': 'Activar niebla',
            'lightflow_environment.field.distance_fog_color_mode': 'Color',
            'lightflow_environment.option.fog_color_sky': 'Seguir el horizonte del cielo',
            'lightflow_environment.option.fog_color_time': 'Colores personalizados por hora',
            'lightflow_environment.option.fog_color_fixed': 'Color fijo',
            'lightflow_environment.field.distance_fog_fixed_color': 'Color fijo de niebla',
            'lightflow_environment.field.distance_fog_near_color': 'Color cercano del gradiente',
            'lightflow_environment.field.distance_fog_day_color': 'Color de niebla diurno',
            'lightflow_environment.field.distance_fog_sunrise_color': 'Color al amanecer / atardecer',
            'lightflow_environment.field.distance_fog_night_color': 'Color de niebla nocturno',
            'lightflow_environment.field.distance_fog_start': 'Distancia inicial',
            'lightflow_environment.field.distance_fog_end': 'Distancia final',
            'lightflow_environment.field.distance_fog_smoothness': 'Suavidad de transición',
            'lightflow_environment.field.distance_fog_gradient': 'Intensidad del degradado',
            'lightflow_environment.field.distance_fog_dither': 'Dither',
            'lightflow_environment.field.distance_fog_max_opacity': 'Opacidad máxima',
            'lightflow_environment.field.distance_fog_sync_background': 'Igualar color del fondo',
            'lightflow_environment.field.distance_grade_enabled': 'Activar corrección',
            'lightflow_environment.field.distance_grade_start': 'Inicio de corrección',
            'lightflow_environment.field.distance_grade_end': 'Fin de corrección',
            'lightflow_environment.field.distance_grade_saturation': 'Saturación lejana',
            'lightflow_environment.field.distance_grade_contrast': 'Contraste lejano',
            'lightflow_environment.field.distance_grade_tint': 'Tinte lejano',
            'lightflow_environment.field.distance_grade_tint_strength': 'Intensidad del tinte lejano',
            'lightflow_environment.field.sun_enabled': 'Iluminación solar y lunar',
            'lightflow_environment.field.sun_intensity': 'Intensidad del sol',
            'lightflow_environment.field.sun_light_color_mode': 'Color de la luz solar',
            'lightflow_environment.option.sun_light_follow_disc': 'Seguir el disco solar',
            'lightflow_environment.option.sun_light_time_colors': 'Día a crepúsculo',
            'lightflow_environment.field.sun_light_day_color': 'Color de luz diurna',
            'lightflow_environment.field.sun_light_twilight_color': 'Color de luz crepuscular',
            'lightflow_environment.field.moon_intensity': 'Intensidad de la luna',
            'lightflow_environment.field.moon_light_color_mode': 'Color de la luz lunar',
            'lightflow_environment.option.moon_light_follow_disc': 'Seguir el disco lunar',
            'lightflow_environment.option.moon_light_custom': 'Color personalizado',
            'lightflow_environment.field.moon_light_custom_color': 'Color de luz lunar',
            'lightflow_environment.field.celestial_size': 'Tamaño del sol',
            'lightflow_environment.field.moon_phase': 'Fase lunar',
            'lightflow_environment.option.moon_full': 'Luna llena',
            'lightflow_environment.option.moon_waning_gibbous': 'Gibosa menguante',
            'lightflow_environment.option.moon_third_quarter': 'Cuarto menguante',
            'lightflow_environment.option.moon_waning_crescent': 'Menguante',
            'lightflow_environment.option.moon_new': 'Luna nueva',
            'lightflow_environment.option.moon_waxing_crescent': 'Creciente',
            'lightflow_environment.option.moon_first_quarter': 'Cuarto creciente',
            'lightflow_environment.option.moon_waxing_gibbous': 'Gibosa creciente',
            'lightflow_environment.field.sun_mode': 'Apariencia del sol',
            'lightflow_environment.field.moon_mode': 'Apariencia de la luna',
            'lightflow_environment.field.sun_blend_mode': 'Fusión del sol',
            'lightflow_environment.field.sun_opacity': 'Opacidad del sol',
            'lightflow_environment.field.moon_blend_mode': 'Fusión de la luna',
            'lightflow_environment.field.moon_opacity': 'Opacidad de la luna',
            'lightflow_environment.field.sun_texture': 'Textura del sol',
            'lightflow_environment.field.moon_texture': 'Textura de la luna',
            'lightflow_environment.field.moon_texture_layout': 'Formato de textura lunar',
            'lightflow_environment.field.moon_atlas_columns': 'Columnas del atlas lunar',
            'lightflow_environment.field.moon_atlas_rows': 'Filas del atlas lunar',
            'lightflow_environment.field.moon_phase_offset': 'Desfase de fase lunar',
            'lightflow_environment.field.sun_horizon_scale': 'Tamaño del sol al atardecer',
            'lightflow_environment.field.sun_gaze_scale': 'Tamaño del sol al mirarlo',
            'lightflow_environment.field.sun_glare': 'Resplandor solar',
            'lightflow_environment.field.lens_flare_enabled': 'Destellos de lente de Minecraft',
            'lightflow_environment.field.lens_flare_strength': 'Intensidad de destellos',
            'lightflow_environment.field.lens_flare_scale': 'Tamaño de destellos',
            'lightflow_environment.field.cloud_translucency': 'Transmisión de luz en nubes',
            'lightflow_environment.field.sunset_directional_glow': 'Resplandor direccional del atardecer',
            'lightflow_environment.option.celestial_vanilla': 'Textura de Minecraft',
            'lightflow_environment.option.celestial_texture': 'Textura del proyecto',
            'lightflow_environment.option.celestial_blend_preset': 'Preset (original)',
            'lightflow_environment.option.celestial_blend_alpha': 'Mezcla alfa',
            'lightflow_environment.option.celestial_blend_additive': 'Aditivo',
            'lightflow_environment.option.celestial_blend_multiply': 'Multiplicativo',
            'lightflow_environment.option.moon_atlas': 'Atlas de fases',
            'lightflow_environment.option.moon_single': 'Textura individual',
            'lightflow_environment.option.hidden': 'Oculto',
            'lightflow_environment.option.texture_none': 'Selecciona una textura del proyecto',
            'lightflow_environment.field.stars': 'Estrellas',
            'lightflow_environment.field.star_brightness': 'Brillo de las estrellas',
            'lightflow_environment.field.star_density': 'Densidad de estrellas',
            'lightflow_environment.field.clouds': 'Nubes de Minecraft',
            'lightflow_environment.field.cloud_time_profiles_enabled': 'Usar perfiles de nubes por hora',
            'lightflow_environment.field.cloud_time_frame': 'Clave de aspecto de nubes',
            'lightflow_environment.field.cloud_time_tick': 'Hora de la clave (0–23999)',
            'lightflow_environment.field.cloud_time_section': 'Editar apariencia',
            'lightflow_environment.field.cloud_time_new': 'Nueva hora clave',
            'lightflow_environment.option.cloud_time_appearance': 'Cobertura y apariencia',
            'lightflow_environment.option.cloud_time_colors': 'Colores de las nubes',
            'lightflow_environment.option.cloud_time_lighting': 'Iluminación y niebla',
            'lightflow_environment.option.cloud_time_edges': 'Degradado y bisel',
            'lightflow_environment.option.cloud_time_light_only': 'Iluminación',
            'lightflow_environment.option.cloud_time_fog': 'Niebla por distancia',
            'lightflow_environment.option.cloud_time_advanced': 'Material avanzado',
            'lightflow_environment.option.gradient_visible': 'Visible',
            'lightflow_environment.option.gradient_hidden': 'Oculto',
            'lightflow_environment.field.cloud_gradient_hide': 'Ocultar degradado',
            'lightflow_environment.info.cloud_effect_inactive': 'Grosor 0 u Ocultar degradado 1 desactiva el degradado. La luz del borde también necesita dispersión mayor que 0. Los controles ocultos conservan sus valores.',
            'lightflow_environment.action.cloud_time_profiles': 'Editar perfiles de nubes por hora',
            'lightflow_environment.action.cloud_time_add': 'Añadir perfil de nubes a esta hora',
            'lightflow_environment.action.cloud_time_remove': 'Eliminar perfil seleccionado',
            'lightflow_environment.dialog.cloud_time_profiles': 'Línea de tiempo de las nubes',
            'lightflow_environment.info.cloud_time_profiles': 'Crea apariencias distintas para el día, el atardecer y la noche. Se mezclan suavemente, incluso al cruzar medianoche. La textura, el movimiento, la escala y la estructura se comparten para evitar saltos. Desactiva los perfiles por hora para recuperar el aspecto fijo.',
            'lightflow_environment.field.cloud_mode': 'Origen de las nubes',
            'lightflow_environment.field.cloud_style': 'Sombreado de nubes',
            'lightflow_environment.field.cloud_palette_mode': 'Paleta de nubes',
            'lightflow_environment.option.cloud_palette_preset': 'Paleta del preset Rendercraft',
            'lightflow_environment.option.cloud_palette_custom': 'Paleta de nubes personalizada',
            'lightflow_environment.field.cloud_texture': 'Textura de las nubes',
            'lightflow_environment.option.cloud_procedural': 'Bloques procedurales',
            'lightflow_environment.option.cloud_vanilla': 'Vanilla (recursos locales)',
            'lightflow_environment.resources.title': "Recursos Vanilla",
            'lightflow_environment.resources.help': "Las imágenes Vanilla se preparan al activar Environment: caché local, pack ya configurado en Terrain o descarga directa de Mojang. La descarga está sujeta a la EULA de Minecraft. Se guardan en este dispositivo, fuera de los proyectos. Importar ZIP/MCPACK/JAR es una opción avanzada; requiere el atlas lunar clásico de 4 x 2.",
            'lightflow_environment.resources.loaded': "Recursos locales cargados",
            'lightflow_environment.resources.missing': "No se pudieron preparar los recursos Vanilla. Revisa la conexión; reintenta o elige un pack local en Ver > Recursos Vanilla.",
            'lightflow_environment.resources.session': "solo esta sesión",
            'lightflow_environment.resources.retry': 'Preparar recursos Vanilla',
            'lightflow_environment.resources.import': "Elegir pack o JAR local",
            'lightflow_environment.resources.remove': "Borrar recursos locales",
            'lightflow_environment.option.cloud_texture': 'Textura del proyecto',
            'lightflow_environment.option.cloud_style_vanilla': 'Caras planas Vanilla',
            'lightflow_environment.option.cloud_style_rendercraft': 'Caras biseladas Rendercraft',
            'lightflow_environment.option.cloud_style_vibrant': 'Caras estilizadas Vibrant Visuals',
            'lightflow_environment.field.cloud_coverage': 'Cobertura de nubes',
            'lightflow_environment.field.cloud_opacity': 'Opacidad de las nubes',
            'lightflow_environment.field.cloud_speed': 'Velocidad de las nubes',
            'lightflow_environment.field.cloud_paused': 'Pausar nubes aquí',
            'lightflow_environment.field.cloud_offset_x': 'Desplazamiento X',
            'lightflow_environment.field.cloud_offset_y': 'Desplazamiento Y (horizontal)',
            'lightflow_environment.field.cloud_scale': 'Escala de nubes',
            'lightflow_environment.field.cloud_direction': 'Dirección de nubes',
            'lightflow_environment.field.cloud_contrast': 'Contraste de nubes',
            'lightflow_environment.field.cloud_brightness': 'Brillo de nubes',
            'lightflow_environment.field.cloud_height': 'Altura de la capa de nubes',
            'lightflow_environment.field.cloud_thickness': 'Grosor de las nubes',
            'lightflow_environment.field.cloud_extrusion': 'Extrusión 3D de las nubes',
            'lightflow_environment.field.cloud_bevel_width': 'Ancho del bisel',
            'lightflow_environment.field.cloud_bevel_enabled': 'Activar bisel',
            'lightflow_environment.field.cloud_scattering_strength': 'Intensidad de dispersión',
            'lightflow_environment.info.cloud_scattering_strength': 'Escala la luz de bordes y la dispersión direccional. Cero elimina esos aportes; conserva la luz difusa.',
            'lightflow_environment.field.cloud_gradient_thickness': 'Ancho del degradado (celdas)',
            'lightflow_environment.info.cloud_gradient_thickness': 'Ancho visible hacia dentro del contorno rectangular, en celdas. 0 elimina la franja; 1 abarca una celda. Independiente del bisel y del espesor de la capa.',
            'lightflow_environment.field.cloud_gradient_alpha': 'Desvanecimiento del borde',
            'lightflow_environment.info.cloud_gradient_alpha': '0: degradado completo. 1: sin degradado de borde. No oculta la nube ni cambia su opacidad global.',
            'lightflow_environment.field.cloud_view_response': 'Respuesta a cámara y luz',
            'lightflow_environment.info.cloud_view_response': '0: sin cambio. 1: las caras de frente muestran menos brillo suave y transmisión; las rasantes dispersan más luz, especialmente hacia el sol o la luna.',
            'lightflow_environment.field.cloud_edge_hardness': 'Dureza del borde',
            'lightflow_environment.info.cloud_edge_hardness': '0: difuminado suave. 1: transición rectangular dura con antialiasing. Independiente del bisel.',
            'lightflow_environment.field.cloud_scattering_size': 'Recorrido óptico del borde',
            'lightflow_environment.info.cloud_scattering_size': 'Multiplicador avanzado del recorrido óptico dentro de la franja. Cambia la absorción, no el grosor del degradado.',
            'lightflow_environment.field.cloud_optical_thickness': 'Grosor óptico',
            'lightflow_environment.info.cloud_optical_thickness': 'Multiplica la absorción a lo largo de la vista y la luz. No cambia el espesor geométrico de la capa.',
            'lightflow_environment.field.cloud_phase_anisotropy': 'Dispersión hacia delante',
            'lightflow_environment.info.cloud_phase_anisotropy': 'Controla cuánto se concentra la dispersión al mirar hacia la fuente de luz.',
            'lightflow_environment.field.cloud_density_variation': 'Variación de densidad interior',
            'lightflow_environment.info.cloud_density_variation': 'Variación interior determinista anclada a las nubes. Cero da densidad interior uniforme.',
            'lightflow_environment.field.cloud_bevel_smooth': 'Bisel suave (smoothstep)',
            'lightflow_environment.field.cloud_bevel_softness': 'Difuminado del bisel',
            'lightflow_environment.field.cloud_bevel_roundness': 'Redondez del bisel',
            'lightflow_environment.field.cloud_bevel_strength': 'Intensidad de normales del bisel',
            'lightflow_environment.field.cloud_bevel_distance_fade': 'Reducir bisel con la distancia',
            'lightflow_environment.field.cloud_bevel_distance_min_scale': 'Ancho mínimo del bisel lejano',
            'lightflow_environment.field.cloud_edge_strength': 'Luz del borde exterior',
            'lightflow_environment.field.cloud_shadow_bevel_strength': 'Tinte de sombra del bisel',
            'lightflow_environment.field.cloud_lighting_mode': 'Iluminación de color de nubes',
            'lightflow_environment.option.cloud_lighting_palette': 'Solo paleta',
            'lightflow_environment.option.cloud_lighting_sky': 'Color del cielo',
            'lightflow_environment.option.cloud_lighting_mixed': 'Paleta + luz del cielo',
            'lightflow_environment.field.cloud_environment_influence': 'Influencia del color ambiental',
            'lightflow_environment.info.cloud_environment_influence': '0 conserva tu paleta sin coloración del cielo, sol, hora ni niebla; 1 conserva toda la influencia ambiental. Usa blanco en las caras para nubes neutras. La opacidad sigue mostrando el cielo detrás de las nubes.',
            'lightflow_environment.field.cloud_time_tint_strength': 'Influencia de la hora del día',
            'lightflow_environment.info.cloud_time_tint_strength': 'Interpola la iluminación de día, atardecer y noche entre 0 (paleta y brillo fijos) y 1 (ciclo completo). Cielo, sol y niebla tienen controles independientes.',
            'lightflow_environment.field.cloud_sky_tint_strength': 'Influencia del color del cielo',
            'lightflow_environment.field.cloud_sun_tint_strength': 'Influencia del color del sol',
            'lightflow_environment.field.cloud_fog_enabled': 'Niebla de distancia en nubes',
            'lightflow_environment.field.cloud_fog_color_mode': 'Origen del color de niebla',
            'lightflow_environment.option.cloud_fog_sky': 'Seguir degradado del cielo',
            'lightflow_environment.option.cloud_fog_custom': 'Color de niebla personalizado',
            'lightflow_environment.field.cloud_fog_color': 'Color de niebla de nubes',
            'lightflow_environment.field.cloud_fog_strength': 'Intensidad de niebla en nubes',
            'lightflow_environment.field.cloud_fog_start': 'Inicio de niebla en nubes',
            'lightflow_environment.field.cloud_fog_end': 'Fin de niebla en nubes',
            'lightflow_environment.field.cloud_density': 'Densidad óptica de nubes',
            'lightflow_environment.field.cloud_absorption': 'Absorción de luz en nubes',
            'lightflow_environment.field.environment_bloom_enabled': 'Usar Bloom del entorno',
            'lightflow_environment.field.bloom_threshold': 'Umbral de Bloom',
            'lightflow_environment.field.bloom_soft_knee': 'Transición suave de Bloom',
            'lightflow_environment.field.bloom_strength': 'Fuerza de Bloom',
            'lightflow_environment.field.bloom_core_strength': 'Intensidad del núcleo de Bloom',
            'lightflow_environment.field.bloom_core_radius': 'Radio del núcleo de Bloom',
            'lightflow_environment.field.bloom_halo_strength': 'Fuerza del halo de Bloom',
            'lightflow_environment.field.bloom_halo_radius': 'Radio del halo de Bloom',
            'lightflow_environment.field.bloom_hdr_strength': 'Aporte HDR al Bloom',
            'lightflow_environment.field.bloom_emissive_strength': 'Aporte emisivo al Bloom',
            'lightflow_environment.field.bloom_occlusion': 'Oclusión de Bloom',
            'lightflow_environment.field.sun_bloom_contribution': 'Aporte del sol al Bloom',
            'lightflow_environment.field.moon_bloom_contribution': 'Aporte de la luna al Bloom',
            'lightflow_environment.field.star_bloom_contribution': 'Aporte de estrellas al Bloom',
            'lightflow_environment.field.cloud_bloom_contribution': 'Aporte de nubes al Bloom',
            'lightflow_environment.field.cast_shadows': 'Proyectar sombras solares',
            'lightflow_environment.field.shadows_disabled.desc': 'Activa la luz del sol / luna para usar las sombras del entorno.',
            'lightflow_environment.field.shadow_auto_fit': 'Región fija de sombras',
            'lightflow_environment.field.show_shadow_gizmo': 'Mostrar caja de sombras editable',
            'lightflow_environment.field.shadow_area': 'Área de captura de sombras',
            'lightflow_environment.field.shadow_resolution': 'Resolución de sombras',
            'lightflow_environment.field.shadow_camera_quality': 'Detalle de sombras de cámara',
            'lightflow_environment.field.shadow_camera_quality.desc': 'Dos mapas de detalle siguen la cámara para la luz direccional principal. Equilibrado limita el mapa cercano a 2048; Alto a 4096 en preview y 8192 en Studio. Las demás luces conservan sus mapas.',
            'lightflow_environment.field.shadow_camera_distance': 'Alcance del detalle cercano',
            'lightflow_environment.field.shadow_camera_distance.desc': 'Profundidad cubierta desde la parte más cercana de la escena. El espacio vacío anterior no consume detalle. Una distancia menor concentra más texeles cerca. La caja original conserva la cobertura lejana y toda la profundidad de los objetos que proyectan sombras.',
            'lightflow_environment.option.camera_shadow.off': 'Desactivado — mapa original',
            'lightflow_environment.option.camera_shadow.balanced': 'Equilibrado',
            'lightflow_environment.option.camera_shadow.high': 'Alto',
            'lightflow_environment.field.shadow_softness_mode': "Estilo de sombra",
            'lightflow_environment.field.shadow_softness_mode.desc': "Nítida: bordes definidos con antialiasing. Artística: desenfoque constante. Por distancia: penumbra creciente. Clásica: filtro de proyectos anteriores.",
            'lightflow_environment.shadow_mode.hard': "Nítida (AA)",
            'lightflow_environment.shadow_mode.artistic': "Artística",
            'lightflow_environment.shadow_mode.distance': "Por distancia",
            'lightflow_environment.shadow_mode.legacy': "Clásica",
            'lightflow_environment.field.shadow_blur': "Radio de desenfoque",
            'lightflow_environment.field.shadow_blur.desc': "Desenfoque constante, incluso en el contacto. 0 = sombra dura; 8 = suave; 32–64 = amplio. Mantiene el tamaño al cambiar la resolución.",
            'lightflow_environment.field.shadow_softness': 'Tamaño angular del sol',
            'lightflow_environment.field.shadow_softness.desc': 'Diámetro angular del sol en grados. Valores mayores ensanchan la penumbra al aumentar la distancia entre bloqueador y receptor; 0 mantiene sombras duras.',
            'lightflow_environment.field.studio_shadow_resolution': 'Calidad de sombras en Studio',
            'lightflow_environment.field.studio_shadow_resolution.desc': 'Resolución de sombras usada solo en Studio Render. Igual que vista previa conserva la calidad del visor.',
            'lightflow_environment.option.studio_shadow.same': 'Igual que vista previa',
            'lightflow_environment.field.shadow_near': 'Plano cercano de sombras',
            'lightflow_environment.field.shadow_far': 'Plano lejano de sombras',
            'lightflow_environment.field.shadow_bias': 'Bias de sombras',
            'lightflow_environment.field.normal_bias_auto': 'Bias normal automático',
            'lightflow_environment.field.normal_bias': 'Bias normal de sombras',
            'lightflow_environment.field.pixelated_shadows': 'Sombras pixeladas Vibrant Visuals',
            'lightflow_environment.field.pixel_shadow_steps': 'Niveles de tono de sombra',
            'lightflow_environment.field.pixel_shadow_scale': 'Tamaño del píxel de sombra',
            'lightflow_environment.undo.edit': 'Editar entorno',
            'lightflow_environment.undo.edit_gradient': 'Editar gradiente del cielo',
            'lightflow_environment.undo.select_preset': 'Seleccionar preset de cielo',
            'lightflow_environment.undo.create_preset': 'Crear preset de cielo',
            'lightflow_environment.undo.duplicate_preset': 'Duplicar preset de cielo',
            'lightflow_environment.undo.rename_preset': 'Renombrar preset de cielo',
            'lightflow_environment.undo.change_preset_icon': 'Cambiar icono del preset de cielo',
            'lightflow_environment.undo.change_preset_color': 'Cambiar color del preset de cielo',
            'lightflow_environment.undo.change_base_sky_model': 'Cambiar modelo de cielo base',
            'lightflow_environment.undo.import_preset': 'Importar preset de cielo',
            'lightflow_environment.undo.delete_preset': 'Eliminar preset de cielo',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requiere Light Manager 1.8.0 o posterior.',
            'lightflow_environment.field.shadow_scene_fit': 'Abarcar toda la escena automáticamente',
            'lightflow_environment.field.shadow_region_locked': 'Bloquear región de sombras en el mundo',
            'lightflow_environment.info.quick_preset': 'Los cambios rápidos de hora, ciclo, luz y sombras afectan al proyecto. Los ajustes avanzados crean una copia editable.',
            'lightflow_environment.info.native_preset_locked': 'Preset global · Ajustes rápidos',
            'lightflow_environment.info.custom_preset_editable': 'Preset de cielo personalizado · Editable',
            'lightflow_environment.info.no_custom_presets': 'Aún no hay presets de cielo personalizados',
            'lightflow_environment.message.native_preset_locked': 'Los presets de cielo nativos no se pueden editar.',
            'lightflow_environment.message.create_copy_to_edit': 'Este es un preset de cielo nativo. Crea una copia editable para personalizarlo.',
            'lightflow_environment.message.delete_preset_confirm': '¿Eliminar el preset de cielo "{name}"? Esta acción no se puede deshacer.',
            'lightflow_environment.message.preset_duplicated': 'Preset de cielo duplicado',
            'lightflow_environment.message.editable_copy_created': 'Copia editable del cielo creada. Tu preset global se conserva.',
            'lightflow_environment.message.preset_import_failed': 'No se pudo importar ningún preset de cielo válido',
            'lightflow_environment.message.preset_imported': 'Preset de cielo importado',
            'lightflow_environment.message.fit_selection': 'Sombras del entorno ajustadas a la geometría seleccionada.',
            'lightflow_environment.message.fit_scene': 'Sombras del entorno ajustadas a toda la geometría de la escena.',
            'lightflow_environment.message.fit_no_geometry': 'No hay geometría disponible para ajustar la región de sombras.'
        }));
    }

    function registerProjectProperty() {
        if ((projectProperty && projectPresetsProperty) || typeof Property === 'undefined') return projectProperty;
        const projectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (window.Project?.constructor && Project.constructor !== Object ? Project.constructor : null);
        if (!projectClass) return null;
        if (!projectProperty) {
            projectProperty = new Property(projectClass, 'string', PROJECT_PROPERTY, { default: '', exposed: true });
            deletables.push(projectProperty);
        }
        if (!projectPresetsProperty) {
            projectPresetsProperty = new Property(projectClass, 'string', PROJECT_PRESETS_PROPERTY, { default: '', exposed: true });
            deletables.push(projectPresetsProperty);
        }
        return projectProperty;
    }

    function beginEnvironmentProject(project) {
        const nextProject = project || null;
        if (environmentProject === nextProject) return false;
        cancelEnvironmentUndo(false);
        clearProjectTextureCache();
        environmentRevision += 1;
        environmentProject = nextProject;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
        lastSunShadowConfig = '';
        lastSunShadowDirection = null;
        lastSunShadowRefresh = 0;
        lastSunShadowGizmoSignature = '';
        return true;
    }

    function loadProjectSettings(project, model) {
        const activeProject = project || null;
        beginEnvironmentProject(activeProject);
        if (pendingProjectTextureChanges) {
            pendingProjectTextureChanges = false;
            clearProjectTextureCache();
        }
        if (!activeProject) {
            customSkyPresets = {};
            activeSkyPresetId = 'vanilla';
            if (skyMesh) skyMesh.visible = false;
            if (starMesh) starMesh.visible = false;
            if (cloudMesh) cloudMesh.visible = false;
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
        const hasLegacyProjectSettings = typeof raw === 'string' && !!raw.trim();
        if (hasLegacyProjectSettings) {
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)));
            } catch (error) {
                console.warn('[Lightflow Environment] Project settings are invalid; using saved defaults.', error);
                settings = loadSettings();
            }
        } else {
            settings = getNativeSkyPresetSettings('vanilla', { enabled: false });
        }
        loadEnvironmentPresetRegistry(activeProject, model, { migrateLegacy: hasLegacyProjectSettings });
        if (!hasLegacyProjectSettings) {
            const selectedPreset = getSkyPreset(activeSkyPresetId);
            if (selectedPreset?.native) {
                settings = getNativeSkyPresetSettings(selectedPreset.id, { enabled: settings.enabled });
            } else if (selectedPreset) {
                settings = normalizeSettings(Object.assign(
                    {},
                    DEFAULT_SETTINGS,
                    selectedPreset.settings,
                    { preset: selectedPreset.basePresetId, enabled: settings.enabled }
                ));
            }
        }
        rebuildEnvironmentPanelForm();
        updateScene({
            forceShadow: true,
            animation: false,
            deferRenderPreparation: true
        });
        dispatchChanged('project_load');
        void syncManagedVanillaResources();
        requestPreviewRender();
    }

    function startAnimation() {
        if (animationHandleType === 'frame' && animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        } else if (animationHandleType === 'timeout' && animationFrame !== null) {
            clearTimeout(animationFrame);
        }
        animationFrame = null;
        animationHandleType = '';
        lastFrameTime = 0;
        let lastParentCheck = 0;
        const tick = (timestamp = performance.now()) => {
            if (!lastFrameTime) lastFrameTime = timestamp;
            const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTime) / 1000));
            lastFrameTime = timestamp;
            if (timestamp - lastParentCheck >= 1000) {
                lastParentCheck = timestamp;
                ensureSunLightParent();
            }
            const animateTime = !!settings.animate_time;
            const animateClouds = !!(settings.clouds_enabled && !settings.cloud_paused && Math.abs(settings.cloud_speed) > 0.000001);
            const animated = settings.enabled && !window.LightManagerStudioRenderSession && (animateTime || animateClouds);
            if (animated && animateTime) {
                settings.time = mod(settings.time + deltaSeconds * 24000 / Math.max(settings.day_length_seconds, 1), 24000);
            }
            const cloudSpeed = Math.abs(finite(settings.cloud_speed, 0));
            const frameQuality = clamp(
                finite(window.LightflowFrameBudget?.get?.()?.cloudScale, 1),
                0.4,
                1
            );
            const cloudInterval = animateTime
                ? 33
                : cloudSpeed < 0.01
                    ? 80
                    : cloudSpeed < 0.03
                        ? 50
                        : 33;
            const renderInterval = Math.round(cloudInterval / Math.max(frameQuality, 0.4));
            cloudRuntimeStats.lastAnimationIntervalMs = renderInterval;
            if (animated && timestamp - lastRenderTime >= renderInterval) {
                lastRenderTime = timestamp;
                if (animateTime) {
                    syncEnvironmentPanel({ timeOnly: true });
                    updateScene({ forceShadow: false, animation: true });
                    dispatchChanged('animation');
                } else if (cloudMaterial) {
                    cloudMaterial.uniforms.uCloudTime.value = updateCloudDerivedUniforms();
                }
                cloudRuntimeStats.requestedFrames++;
                requestPreviewRender();
            }
            if (animated) {
                animationHandleType = 'frame';
                animationFrame = requestAnimationFrame(tick);
            } else {
                animationHandleType = 'timeout';
                animationFrame = setTimeout(() => tick(performance.now()), 250);
            }
        };
        ensureSunLightParent();
        animationHandleType = 'frame';
        animationFrame = requestAnimationFrame(tick);
    }

    function disposeScene() {
        vanillaResourceGeneration++;
        automaticVanillaTransfer?.abort();
        automaticVanillaTransfer = null;
        automaticVanillaAttempted = false;
        vanillaResourceRestorePending = true;
        managedVanillaRoot = '';
        managedVanillaRequestRoot = '';
        [...vanillaResourceDecoders].forEach(cancel => cancel());
        vanillaResourceDialog?.hide?.();
        vanillaResourceDialog = null;
        vanillaResourceStatus = {state: 'missing', source: '', persisted: false, files: []};
        lensFlareMesh?.parent?.remove?.(lensFlareMesh);
        lensFlareMesh?.geometry?.dispose?.();lensFlareMaterial?.dispose?.();lensVisibilityTarget?.dispose?.();
        // Visibility proxies borrow the sky/cloud geometry and materials.
        lensVisibilityScene?.clear?.();
        lensFlareMesh=null;lensFlareMaterial=null;lensVisibilityScene=null;lensVisibilityTarget=null;lensAlphaProbe=null;
        disposeSunShadowGizmo();
        if (sunLight) {
            if (window.three_lights?.[sunLight.uuid] === sunLight) delete window.three_lights[sunLight.uuid];
            sunLight.parent?.remove?.(sunLight);
            sunLight.shadow?.map?.dispose?.();
        }
        sunTarget?.parent?.remove?.(sunTarget);
        starMesh?.parent?.remove?.(starMesh);
        starMesh?.geometry?.dispose?.();
        starMaterial?.dispose?.();
        cloudMesh?.parent?.remove?.(cloudMesh);
        cloudMesh?.geometry?.dispose?.();
        cloudMaterial?.dispose?.();
        skyMesh?.parent?.remove?.(skyMesh);
        skyMesh?.geometry?.dispose?.();
        skyMaterial?.dispose?.();
        skyGradientTexture?.dispose?.();
        vanillaSunTexture?.dispose?.();
        endSkyTexture?.dispose?.();
        vibrantVisualsSunTexture?.dispose?.();
        vanillaMoonPhasesTexture?.dispose?.();
        vanillaCloudTexture?.dispose?.();
        proceduralCloudTexture?.dispose?.();
        fallbackTexture?.dispose?.();
        missingSkyTexture?.dispose?.();
        clearCloudOccupancyCache();
        clearProjectTextureCache();
        sunLight = null;
        sunTarget = null;
        skyMesh = null;
        skyMaterial = null;
        orthographicSkyCamera = null;
        skyGradientTexture = null;
        skyGradientTextureData = null;
        lastSkyGradientSignature = '';
        skyGradientSamples = null;
        starMesh = null;
        starMaterial = null;
        starAttemptIndexCounts = null;
        cloudMesh = null;
        cloudMaterial = null;
        vanillaSunTexture = null;
        endSkyTexture = null;
        vibrantVisualsSunTexture = null;
        vanillaMoonPhasesTexture = null;
        vanillaCloudTexture = null;
        proceduralCloudTexture = null;
        fallbackTexture = null;
        builtInSkyTexturesReady = false;
        missingSkyTexture = null;
    }

    installTranslations();

    let environmentRuntimeLoaded = false;
    let deferredLightManagerInit = null;

    function environmentDependenciesReady() {
        return !!(
            window.LIGHT_MANAGER_LOADED &&
            window.LightManagerUI?.formDesign &&
            typeof window.LightManagerUI.formDesign.gradient === 'function' &&
            window.LightManagerUI?.IdentityMenu &&
            typeof window.LightManagerUI.applyFormGroups === 'function' &&
            typeof window.LightManagerUI.addDesignedPanelStyles === 'function' &&
            window.LightManagerUI.formElementTypes?.includes('gradient_editor')
        );
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Environment',
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAv0lEQVR4AdSSsQ3CMBBFvzwAEmQNJqCgo2cJhmEFZoAFKOnoWSMUWcC5K750Vs6J5USREvnp7B/f97fkcH/GSB7vGGtgv9aAhT/X8HZpUYKXxTX0NpZqE4aN+HiInBkThpmuEXkDhvsdQA4yV0ZulPzSvQr7ta595VYSeYicGeskfH0blOCFXCzh9QQoieG/A2qwSYO6WvQZlGB7dE7TJCHFOXVgeD4CFppT4/rzAzwGhmyorcE7xWo0psZ1rvYAAAD//+6FnYMAAAAGSURBVAMA6LelEdx4gnIAAAAASUVORK5CYII=',
        author: 'MidFord327',
        description: 'Minecraft environment rendering with full-sky editable gradients, deterministic Vanilla stars, cinematic voxel clouds with configurable bevel lighting and fog, textured celestial atlases, reflections, and directional shadows.',
        tags: ['Lightflow', 'Minecraft', 'Environment'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],

        onload: function loadLightflowEnvironment() {
            if (environmentRuntimeLoaded) return;
            if (!environmentDependenciesReady()) {
                if (!deferredLightManagerInit) {
                    deferredLightManagerInit = () => {
                        if (!environmentDependenciesReady()) return;
                        window.removeEventListener('light_manager_initialized', deferredLightManagerInit);
                        deferredLightManagerInit = null;
                        loadLightflowEnvironment();
                    };
                    window.addEventListener('light_manager_initialized', deferredLightManagerInit);
                }
                const lightManagerInstalled = window.Plugins?.all?.some?.(plugin => plugin?.id === 'light_manager' && plugin.installed !== false);
                if (!lightManagerInstalled) {
                    Blockbench.showToastNotification({
                        text: tr('lightflow_environment.message.light_manager_required', 'Lightflow Environment requires Light Manager.'),
                        icon: 'error',
                        expire: 10000
                    });
                }
                return;
            }
            environmentRuntimeLoaded = true;
            addEnvironmentDialogStyles();
            registerProjectProperty();
            registerEnvironmentUndoHooks();
            installUI();
            createSky();
            createSunLight();
            installSunShadowGizmoInteraction();

            publishWindowBinding('LightflowEnvironment', {
                prepareShadowRegion(preview, options = {}) {
                    if (!settings.enabled || !sunLight || !settings.shadow_auto_fit) return false;
                    const state = getCelestialLightingState();
                    updateSunShadowPlacement(state.celestialDirection, preview);
                    const changed = configureSunShadow(false, { ...options, preview, state });
                    if (changed && preview?.renderer?.shadowMap) preview.renderer.shadowMap.needsUpdate = true;
                    if (sunShadowGizmo?.root?.visible) updateSunShadowGizmo();
                    return changed;
                },
                get settings() { return Object.assign({}, settings); },
                getVanillaResourceStatus,
                importVanillaArchive,
                clearLocalVanillaResources,
                openVanillaResources: openVanillaResourceDialog,
                getSkyPresets() {
                    return [
                        ...Object.keys(PRESETS).map(id => getNativeSkyPresetDefinition(id)),
                        ...Object.values(customSkyPresets).map(preset => cloneEnvironmentData(preset))
                    ];
                },
                getActiveSkyPreset: () => cloneEnvironmentData(getActiveSkyPresetIdentity()),
                selectSkyPreset: selectEnvironmentSkyPreset,
                createSkyPreset: createCustomSkyPreset,
                duplicateSkyPreset: duplicateEnvironmentSkyPreset,
                importSkyPresets: importEnvironmentSkyPresets,
                exportSkyPreset: exportEnvironmentSkyPreset,
                setSettings: applySettings,
                applyPreset,
                open: openSettingsDialog,
                getLightingState,
                getDistanceFogConfig,
                getDistanceGradeConfig,
                applyDistanceLook,
                getSkyGradientProfiles: () => JSON.parse(JSON.stringify(getSkyGradientProfiles())),
                getSkyGradientTexture() {
                    const state = getLightingState();
                    updateSkyGradientTexture(state);
                    return ensureSkyGradientTexture();
                },
                getBloomSettings,
                getBloomContribution,
                renderBloomContribution,
                getVirtualLight,
                getDirectionalLight: () => sunLight,
                getResourceDiagnostics: () => ({
                    version: 'hierarchical-clouds-v1',
                    projectRevision: environmentRevision,
                    clonedTextures: projectEnvironmentTextures.size,
                    proceduralCloudCached: !!proceduralCloudTexture,
                    cloudOccupancyTextures: cloudOccupancyTextures.size,
                    cloudDistanceTextures: cloudDistanceTextures.size,
                    cloudTraversal: '4x4-conservative-max-dda',
                    cloudRuntime: { ...cloudRuntimeStats },
                    settingsPerformance: {
                        ...settingsPerformance,
                        last: settingsPerformance.last
                            ? {
                                ...settingsPerformance.last,
                                changedKeys: settingsPerformance.last.changedKeys.slice(),
                                phases: { ...settingsPerformance.last.phases }
                            }
                            : null
                    }
                }),
                refresh() {
                    updateScene({ forceShadow: true });
                    requestPreviewRender();
                }
            });

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
                // Parsing emits one event per texture; project hydration resolves
                // the completed texture list and environment once after the load.
                if (!window.Project || Project.parsed === false || Blockbench.hasFlag?.('switching_project')) {
                    pendingProjectTextureChanges = true;
                    return;
                }
                pendingProjectTextureChanges = false;
                clearProjectTextureCache();
                rebuildEnvironmentPanelForm();
                updateScene({ forceShadow: false });
                requestPreviewRender();
            };
            const textureListeners = ['add_texture', 'remove_texture', 'update_texture']
                .map(eventName => Blockbench.on(eventName, textureChanged));
            const packsListener = Blockbench.on('lightflow_resource_packs_changed', event => {
                if (event?.project && event.project !== window.Project) return;
                void syncManagedVanillaResources();
            });
            deletables.push(packsListener);
            const viewListener = Blockbench.on('update_view', () => updateSunShadowGizmo());
            deletables.push(Blockbench.on('select_preview_scene', () => {
                if (settings.enabled && typeof PreviewScene !== 'undefined') PreviewScene.active?.unselect?.();
            }));
            const studioRenderPreTileListener = Blockbench.on('studio_render_pre_tile', event => {
                updateScene({
                    forceShadow: false,
                    studio: true,
                    preview: event?.preview
                });
            });
            const studioRenderCompleteListener = Blockbench.on('studio_render_complete', event => {
                updateScene({
                    forceShadow: false,
                    studio: false,
                    preview: event?.source_preview || event?.preview
                });
            });
            const gizmoVisibilityListener = () => updateSunShadowGizmo();
            window.addEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(...textureListeners, viewListener, studioRenderPreTileListener, studioRenderCompleteListener, {
                delete() {
                    window.removeEventListener('light_manager_initialized', lightManagerListener);
                    window.removeEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
                }
            });
            startAnimation();
        },

        onunload() {
            environmentRuntimeLoaded = false;
            if (deferredLightManagerInit) {
                window.removeEventListener('light_manager_initialized', deferredLightManagerInit);
                deferredLightManagerInit = null;
            }
            beginEnvironmentProject(null);
            if (animationHandleType === 'frame' && animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
            } else if (animationHandleType === 'timeout' && animationFrame !== null) {
                clearTimeout(animationFrame);
            }
            animationFrame = null;
            animationHandleType = '';
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            restoreStandaloneDistanceFog();
            disposeScene();
            window.LightManagerUI?.workspace?.unregister?.(environmentPanel);
            environmentPanelAttachmentEstablished = false;
            disposeRegisteredResources();
            restoreWindowBindings();
            window.LightflowAtmosphere?.updateSurfaceFogUniforms?.();
            window.LightflowAtmosphere?.prepareSurfaceFog?.(window.Preview?.selected || window.main_preview || null);
            window.Canvas?.updateAllFaces?.();
            window.ShaderEngine?.updateLightUniforms?.();
        }
    });
})();
