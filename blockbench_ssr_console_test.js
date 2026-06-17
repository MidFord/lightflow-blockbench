// Blockbench console SSR material test, v2
// Paste this entire file into Blockbench DevTools console.
//
// It installs a reversible screen-space reflection probe:
// - Adds a reflective ShaderMaterial floor under the current model.
// - Renders the Blockbench scene into a color + depth WebGLRenderTarget.
// - Raymarches in screen space inside the material shader.
//
// Controls after running:
//   __bbSSRTest.setEnabled(true | false)
//   __bbSSRTest.setIntensity(0.0 to 1.0)
//   __bbSSRTest.setRoughness(0.0 to 1.0)
//   __bbSSRTest.setThickness(0.01 to 4.0)
//   __bbSSRTest.setMaxDistance(1.0 to 256.0)
//   __bbSSRTest.setDistortion(0.0 to 0.5)
//   __bbSSRTest.dispose()

(() => {
    if (window.__bbSSRTest && typeof window.__bbSSRTest.dispose === 'function') {
        window.__bbSSRTest.dispose();
    }

    const THREE = window.THREE;
    const preview = window.main_preview || (window.Preview && window.Preview.selected);
    const scene = (window.Canvas && window.Canvas.scene) || window.scene;

    if (!THREE || !preview || !preview.renderer || !scene) {
        console.warn('[BB SSR Test] Missing THREE, main preview renderer, or Canvas.scene.');
        return;
    }

    const renderer = preview.renderer;
    const canvas = renderer.domElement || preview.canvas;
    const state = {
        enabled: true,
        capturing: false,
        width: 1,
        height: 1,
        maxTargetSize: 1280,
        originalRender: preview.render,
        preview,
        disposed: false
    };

    let depthTexture = null;
    if (THREE.DepthTexture) {
        try {
            depthTexture = new THREE.DepthTexture(1, 1);
            depthTexture.type = THREE.UnsignedShortType || THREE.UnsignedIntType;
            depthTexture.format = THREE.DepthFormat;
            depthTexture.minFilter = THREE.NearestFilter;
            depthTexture.magFilter = THREE.NearestFilter;
            depthTexture.generateMipmaps = false;
        } catch (error) {
            console.warn('[BB SSR Test] DepthTexture unavailable, falling back to approximate reflections.', error);
            depthTexture = null;
        }
    }

    const targetOptions = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false
    };
    if (depthTexture) targetOptions.depthTexture = depthTexture;

    const captureTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    if (depthTexture && !captureTarget.depthTexture) captureTarget.depthTexture = depthTexture;
    captureTarget.texture.name = 'BB_SSR_Test_ScreenColor';
    captureTarget.texture.generateMipmaps = false;

    const group = new THREE.Group();
    group.name = 'BB_SSR_Test_Group';
    scene.add(group);

    const bounds = new THREE.Box3();
    const tmpBox = new THREE.Box3();
    let hasModelBounds = false;

    if (window.Cube && Array.isArray(window.Cube.all)) {
        window.Cube.all.forEach((cube) => {
            if (!cube || !cube.mesh) return;
            cube.mesh.updateMatrixWorld(true);
            tmpBox.setFromObject(cube.mesh);
            if (!Number.isFinite(tmpBox.min.x)) return;
            if (!hasModelBounds) {
                bounds.copy(tmpBox);
                hasModelBounds = true;
            } else {
                bounds.union(tmpBox);
            }
        });
    }

    if (!hasModelBounds) {
        bounds.set(
            new THREE.Vector3(-8, 0, -8),
            new THREE.Vector3(8, 16, 8)
        );
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const modelSpan = Math.max(size.x, size.y, size.z, 8);
    const floorSize = Math.max(24, modelSpan * 2.1);
    const floorY = bounds.min.y - Math.max(0.35, modelSpan * 0.04);

    const uniforms = {
        tScene: { value: captureTarget.texture },
        tDepth: { value: depthTexture || captureTarget.texture },
        uHasDepth: { value: depthTexture ? 1 : 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 1000.0 },
        uCameraIsPerspective: { value: 1 },
        uCameraProjectionMatrix: { value: new THREE.Matrix4() },
        uCameraInverseProjectionMatrix: { value: new THREE.Matrix4() },
        uBaseColor: { value: new THREE.Color(0x101820) },
        uLineColor: { value: new THREE.Color(0x7fffd4) },
        uIntensity: { value: 0.82 },
        uRoughness: { value: 0.16 },
        uDistortion: { value: 0.06 },
        uThickness: { value: Math.max(0.08, modelSpan * 0.025) },
        uMaxDistance: { value: Math.max(12.0, modelSpan * 2.0) },
        uGridScale: { value: Math.max(1.5, floorSize / 16.0) },
        uTime: { value: 0 }
    };

    const ssrMaterial = new THREE.ShaderMaterial({
        name: 'BB_SSR_Test_ShaderMaterial',
        uniforms,
        transparent: true,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
        extensions: {
            derivatives: true
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vViewPosition;
            varying vec3 vViewNormal;
            varying vec4 vClipPosition;

            void main() {
                vUv = uv;
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = viewPosition.xyz;
                vViewNormal = normalize(normalMatrix * normal);
                vClipPosition = projectionMatrix * viewPosition;
                gl_Position = vClipPosition;
            }
        `,
        fragmentShader: `
            precision highp float;

            #define SSR_STEPS 56

            uniform sampler2D tScene;
            uniform sampler2D tDepth;
            uniform int uHasDepth;
            uniform vec2 uResolution;
            uniform float uCameraNear;
            uniform float uCameraFar;
            uniform int uCameraIsPerspective;
            uniform mat4 uCameraProjectionMatrix;
            uniform mat4 uCameraInverseProjectionMatrix;
            uniform vec3 uBaseColor;
            uniform vec3 uLineColor;
            uniform float uIntensity;
            uniform float uRoughness;
            uniform float uDistortion;
            uniform float uThickness;
            uniform float uMaxDistance;
            uniform float uGridScale;
            uniform float uTime;

            varying vec2 vUv;
            varying vec3 vViewPosition;
            varying vec3 vViewNormal;
            varying vec4 vClipPosition;

            float gridLine(vec2 uv, float scale) {
                vec2 g = abs(fract(uv * scale - 0.5) - 0.5) / fwidth(uv * scale);
                float line = min(g.x, g.y);
                return 1.0 - min(line, 1.0);
            }

            float screenEdgeFade(vec2 uv) {
                vec2 edge = smoothstep(vec2(0.0), vec2(0.08), uv) *
                    smoothstep(vec2(0.0), vec2(0.08), 1.0 - uv);
                return edge.x * edge.y;
            }

            bool outsideScreen(vec2 uv) {
                return uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0;
            }

            float perspectiveDepthToViewZ(float depth) {
                return (uCameraNear * uCameraFar) /
                    ((uCameraFar - uCameraNear) * depth - uCameraFar);
            }

            float orthographicDepthToViewZ(float depth) {
                return depth * (uCameraNear - uCameraFar) - uCameraNear;
            }

            float depthToViewZ(float depth) {
                if (uCameraIsPerspective == 1) return perspectiveDepthToViewZ(depth);
                return orthographicDepthToViewZ(depth);
            }

            vec3 sampleScene(vec2 uv, float roughness) {
                float radius = 1.0 + roughness * 7.0;
                vec2 px = radius / max(uResolution, vec2(1.0));
                vec3 color = texture2D(tScene, uv).rgb * 0.48;
                color += texture2D(tScene, uv + vec2(px.x, 0.0)).rgb * 0.13;
                color += texture2D(tScene, uv - vec2(px.x, 0.0)).rgb * 0.13;
                color += texture2D(tScene, uv + vec2(0.0, px.y)).rgb * 0.13;
                color += texture2D(tScene, uv - vec2(0.0, px.y)).rgb * 0.13;
                return color;
            }

            vec3 fallbackReflection(vec2 screenUv, vec3 rayDir, out float hitFade) {
                vec2 uv = screenUv + rayDir.xy * uDistortion / max(0.35, abs(rayDir.z));
                hitFade = screenEdgeFade(uv);
                if (outsideScreen(uv)) hitFade = 0.0;
                return sampleScene(uv, uRoughness);
            }

            vec3 raymarchReflection(vec3 viewPosition, vec3 viewNormal, vec3 rayDir, out float hitFade) {
                hitFade = 0.0;

                if (uHasDepth != 1) {
                    vec2 screenUv = (vClipPosition.xy / max(vClipPosition.w, 0.0001)) * 0.5 + 0.5;
                    return fallbackReflection(screenUv, rayDir, hitFade);
                }

                vec2 hitUv = vec2(0.0);
                float hitDistance = 0.0;
                float startDistance = max(0.025, uMaxDistance * 0.002);

                for (int i = 0; i < SSR_STEPS; i++) {
                    float stepRatio = (float(i) + 1.0) / float(SSR_STEPS);
                    float rayDistance = mix(startDistance, uMaxDistance, stepRatio * stepRatio);
                    vec3 rayPosition = viewPosition + rayDir * rayDistance;

                    if (rayPosition.z > -uCameraNear) break;

                    vec4 clip = uCameraProjectionMatrix * vec4(rayPosition, 1.0);
                    if (clip.w <= 0.0) break;

                    vec2 uv = (clip.xy / clip.w) * 0.5 + 0.5;
                    if (outsideScreen(uv)) break;

                    float sceneDepth = texture2D(tDepth, uv).x;
                    if (sceneDepth >= 0.9999) continue;

                    float sceneViewZ = depthToViewZ(sceneDepth);
                    float depthDelta = rayPosition.z - sceneViewZ;
                    float thickness = uThickness + rayDistance * 0.035;

                    if (depthDelta <= 0.0 && depthDelta > -thickness) {
                        vec2 wave = vec2(
                            sin((uv.y + uTime * 0.09) * 90.0),
                            cos((uv.x - uTime * 0.07) * 70.0)
                        ) * uDistortion * 0.012;
                        hitUv = uv + wave;
                        hitDistance = rayDistance;
                        hitFade = screenEdgeFade(hitUv) *
                            (1.0 - smoothstep(uMaxDistance * 0.45, uMaxDistance, hitDistance));
                        break;
                    }
                }

                if (hitFade <= 0.0 || outsideScreen(hitUv)) return vec3(0.0);
                return sampleScene(hitUv, uRoughness);
            }

            void main() {
                vec3 viewPosition = vViewPosition;
                vec3 viewNormal = normalize(vViewNormal);
                if (!gl_FrontFacing) viewNormal *= -1.0;

                vec3 viewIncident = normalize(viewPosition);
                vec3 rayDir = normalize(reflect(viewIncident, viewNormal));

                float viewFacing = clamp(1.0 - abs(dot(viewNormal, -viewIncident)), 0.0, 1.0);
                float fresnel = pow(viewFacing, 1.55);

                float hitFade = 0.0;
                vec3 reflected = raymarchReflection(viewPosition, viewNormal, rayDir, hitFade);

                float grid = gridLine(vUv, uGridScale);
                float pulse = 0.5 + 0.5 * sin(uTime * 1.7);
                vec3 base = mix(uBaseColor, uLineColor, grid * (0.18 + pulse * 0.08));

                float reflectAmount = uIntensity * hitFade * mix(fresnel, 1.0, 0.45);
                reflectAmount *= 1.0 - clamp(uRoughness * 0.78, 0.0, 0.78);

                vec3 color = mix(base, reflected, reflectAmount);
                color += uLineColor * grid * 0.08;

                gl_FragColor = vec4(color, 0.96);
            }
        `
    });

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(floorSize, floorSize, 1, 1),
        ssrMaterial
    );
    floor.name = 'BB_SSR_Test_Reflective_ShaderMaterial_Floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, floorY, center.z);
    floor.renderOrder = -5;
    group.add(floor);

    const makeMarker = (geometry, color, x, y, z, scale) => {
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(center.x + x, floorY + y, center.z + z);
        mesh.scale.setScalar(scale);
        mesh.name = 'BB_SSR_Test_Reflection_Marker';
        group.add(mesh);
        return mesh;
    };

    makeMarker(new THREE.SphereGeometry(1, 32, 16), 0xff387c, -floorSize * 0.22, modelSpan * 0.28, -floorSize * 0.15, Math.max(1.2, modelSpan * 0.10));
    makeMarker(new THREE.BoxGeometry(1, 1, 1), 0x4de3ff, floorSize * 0.20, modelSpan * 0.22, -floorSize * 0.10, Math.max(2.0, modelSpan * 0.14));
    makeMarker(new THREE.SphereGeometry(1, 32, 16), 0xffd166, floorSize * 0.04, modelSpan * 0.42, floorSize * 0.18, Math.max(1.0, modelSpan * 0.08));

    const copyProjectionInverse = (target, camera) => {
        if (camera.projectionMatrixInverse) {
            target.copy(camera.projectionMatrixInverse);
            return;
        }
        target.copy(camera.projectionMatrix);
        if (typeof target.invert === 'function') {
            target.invert();
        } else if (typeof target.getInverse === 'function') {
            target.getInverse(camera.projectionMatrix);
        }
    };

    const updateCameraUniforms = (camera) => {
        uniforms.uCameraNear.value = camera.near || 0.1;
        uniforms.uCameraFar.value = camera.far || 1000.0;
        uniforms.uCameraIsPerspective.value = camera.isPerspectiveCamera ? 1 : 0;
        uniforms.uCameraProjectionMatrix.value.copy(camera.projectionMatrix);
        copyProjectionInverse(uniforms.uCameraInverseProjectionMatrix.value, camera);
    };

    const resizeTarget = () => {
        const rect = canvas && canvas.getBoundingClientRect
            ? canvas.getBoundingClientRect()
            : { width: window.innerWidth || 800, height: window.innerHeight || 600 };
        const pixelRatio = Math.min(renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1), 1.5);
        const rawWidth = Math.max(2, Math.floor(rect.width * pixelRatio));
        const rawHeight = Math.max(2, Math.floor(rect.height * pixelRatio));
        const scale = Math.min(1, state.maxTargetSize / Math.max(rawWidth, rawHeight));
        const width = Math.max(2, Math.floor(rawWidth * scale));
        const height = Math.max(2, Math.floor(rawHeight * scale));

        if (width === state.width && height === state.height) return;
        state.width = width;
        state.height = height;
        captureTarget.setSize(width, height);
        uniforms.uResolution.value.set(width, height);
    };

    const captureScene = function captureScene() {
        if (!state.enabled || state.capturing || state.disposed) return;
        state.capturing = true;
        resizeTarget();

        const camera = this && this.camera ? this.camera : preview.camera;
        updateCameraUniforms(camera);

        const previousTarget = renderer.getRenderTarget();
        const previousAutoClear = renderer.autoClear;
        const wasFloorVisible = floor.visible;

        floor.visible = false;
        renderer.autoClear = true;
        renderer.setRenderTarget(captureTarget);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAutoClear;
        floor.visible = wasFloorVisible;

        uniforms.uTime.value = performance.now() * 0.001;
        state.capturing = false;
    };

    preview.render = function patchedSSRRender() {
        if (this.controls && typeof this.controls.update === 'function') {
            this.controls.update();
        }
        captureScene.call(this);
        renderer.render(scene, this.camera);
    };

    const refreshOnce = () => {
        try {
            if (preview.controls && typeof preview.controls.update === 'function') {
                preview.controls.update();
            }
            captureScene.call(preview);
            renderer.render(scene, preview.camera);
        } catch (error) {
            console.warn('[BB SSR Test] Refresh failed:', error);
        }
    };

    window.__bbSSRTest = {
        group,
        floor,
        material: ssrMaterial,
        target: captureTarget,
        depthTexture,
        setEnabled(value) {
            state.enabled = !!value;
            floor.visible = !!value;
            refreshOnce();
            return state.enabled;
        },
        setIntensity(value) {
            uniforms.uIntensity.value = Math.max(0, Math.min(1, Number(value) || 0));
            refreshOnce();
            return uniforms.uIntensity.value;
        },
        setRoughness(value) {
            uniforms.uRoughness.value = Math.max(0, Math.min(1, Number(value) || 0));
            refreshOnce();
            return uniforms.uRoughness.value;
        },
        setThickness(value) {
            uniforms.uThickness.value = Math.max(0.01, Math.min(4, Number(value) || 0.01));
            refreshOnce();
            return uniforms.uThickness.value;
        },
        setMaxDistance(value) {
            uniforms.uMaxDistance.value = Math.max(1, Math.min(256, Number(value) || 1));
            refreshOnce();
            return uniforms.uMaxDistance.value;
        },
        setDistortion(value) {
            uniforms.uDistortion.value = Math.max(0, Math.min(0.5, Number(value) || 0));
            refreshOnce();
            return uniforms.uDistortion.value;
        },
        dispose() {
            state.disposed = true;
            if (preview.render === window.__bbSSRTest._patchedRender) {
                preview.render = state.originalRender;
            } else if (preview.render && preview.render.name === 'patchedSSRRender') {
                preview.render = state.originalRender;
            }
            if (group.parent) group.parent.remove(group);
            group.traverse((object) => {
                if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
                const material = object.material;
                if (Array.isArray(material)) {
                    material.forEach((entry) => entry && entry.dispose && entry.dispose());
                } else if (material && typeof material.dispose === 'function') {
                    material.dispose();
                }
            });
            captureTarget.dispose();
            delete window.__bbSSRTest;
            console.log('[BB SSR Test] Disposed.');
        },
        _patchedRender: preview.render
    };

    refreshOnce();
    console.log('[BB SSR Test] Installed v2. Rotate the viewport; the capture now uses the updated camera before final render.', {
        depth: depthTexture ? 'DepthTexture SSR raymarch enabled' : 'No DepthTexture; approximate fallback enabled',
        enabled: '__bbSSRTest.setEnabled(false)',
        intensity: '__bbSSRTest.setIntensity(0.85)',
        roughness: '__bbSSRTest.setRoughness(0.18)',
        thickness: '__bbSSRTest.setThickness(0.12)',
        maxDistance: '__bbSSRTest.setMaxDistance(32)',
        distortion: '__bbSSRTest.setDistortion(0.04)',
        cleanup: '__bbSSRTest.dispose()'
    });
})();
