(function (root) {
    'use strict';

    const LAB_VERSION = '2.0.0';
    const REPORT_SCHEMA_VERSION = 2;
    const STORAGE_KEY = 'lightflow.test_lab.config.v1';
    const ARM_KEY = 'lightflow.test_lab.arm_next_project.v1';
    const DEFAULT_CONFIG = Object.freeze({
        suite: 'full',
        scenarioDurationMs: 2600,
        settleDurationMs: 850,
        warmupTimeoutMs: 65000,
        warmupStableMs: 900,
        coldLoadPostReadyMs: 1200,
        coldLoadMinFrames: 60,
        cameraOrbitDegrees: 38,
        editTransformDistance: 3.0,
        animationDurationMs: 3500,
        includeStudio: true,
        runStudioQualityContract: true,
        runStudioPostBenchmark: false,
        includeHeavyStudio: false,
        studioSmokeResolution: [512, 512],
        studioHdResolution: [1920, 1080],
        studioUhdResolution: [3840, 2160],
        studioHeavyResolution: [4096, 4096],
        studioSamples: 1,
        studioPostBenchmarkSamples: [1, 4],
        studioPostBenchmarkWarmRepeats: 1,
        studioModeMatrix: true,
        studioHdModes: ['lightflow', 'cinematic_craft'],
        studioRepeatHeavy: 0,
        autoExport: true,
        captureConsole: true,
        captureEvents: true,
        captureLongTasks: true,
        captureScreenshots: true,
        telemetryIntervalMs: 250,
        freezeAdaptiveBudget: true,
        profilerMode: 'deep',
        showProgressHud: true,
        progressConsoleStep: 5,
        runPreflight: true,
        runCoreScenarios: true,
        workflowRenderReuseModes: [false, true, true, false],
        workflowArtKeyCacheModes: null,
        workflowArtKeyBatchModes: null,
        workflowWorldEdits: false,
        manualWorkflowDurationMs: 90000,
        traceWorkflowOperations: false,
        runModeCycle: true,
        modeIds: null,
        runOverrideModeCycle: true,
        runInteractionPerMode: true,
        runFeatureToggles: true,
        runFeatureIsolation: true,
        runNoOverridesFixture: true,
        runEditTransform: true,
        runAnimation: true,
        runAnimationMatrix: false,
        runAnimationIsolation: false,
        animationModeIds: null,
        animationShadowStates: null,
        animationRequireNativePlayback: false,
        animationIsolationDurationMs: 5000,
        runLightTests: true,
        runCamera: true,
        runStress: false,
        runSoak: false,
        runContextRecovery: false,
        runLeakAudit: true,
        bedrockEditIterations: 12,
        bedrockTargetIncrementalMs: 16.7,
        bedrockMaxIncrementalP95Ms: 50,
        stressIterations: 12,
        stressCubeCount: 256,
        stressLightCount: 16,
        stressDurationMs: 15000,
        stressSceneOnly: false,
        stressSceneModes: null,
        stressCubeCheckpoints: null,
        stressBatchCellSizes: null,
        stressBatchSourceVisibilityModes: null,
        gpuDrainTimeoutMs: 2500,
        runProjectSwitching: false,
        // Performance diagnostics own their temporary projects. They are never
        // saved to disk and are closed in finally, leaving user tabs intact.
        bootstrapProject: false,
        bootstrapFixtureCount: 2,
        bootstrapCloseReopen: true,
        bootstrapIncludeAnimation: true,
        runVolumeMatrix: false,
        projectSwitchIterations: 2,
        projectSwitchTimeoutMs: 90000,
        projectSwitchResourceReuseModes: null,
        soakDurationMs: 60000,
        contextRestoreTimeoutMs: 30000,
        maxProgramGrowth: 8,
        maxTextureGrowth: 24,
        maxGeometryGrowth: 16,
        traceWebGLErrors: false,
        failOnWebGLError: true,
        failOnRuntimeError: true,
        maxConsoleEntries: 4000,
        maxEventEntries: 12000,
        buildLabel: '',
        sceneLabel: '',
        tags: []
    });

    const VOLUME_RENDER_CASES = Object.freeze([
        { id: 'box_uniform', shape: 'box', density_mode: 'uniform', composite_mode: 'physical', intent: 'physical_medium', expected: 'ANALYTIC_LOCAL' },
        { id: 'box_height', shape: 'box', density_mode: 'height', composite_mode: 'physical', intent: 'physical_medium', edge_feather: 0.14, expected: 'ANALYTIC_LOCAL_QUADRATURE' },
        { id: 'box_cloud', shape: 'box', density_mode: 'cloud', composite_mode: 'physical', intent: 'physical_medium', expected: 'VOLUMETRIC_RAYMARCH' },
        { id: 'sphere_uniform', shape: 'sphere', density_mode: 'uniform', composite_mode: 'physical', intent: 'physical_medium', expected: 'ANALYTIC_LOCAL' },
        { id: 'sphere_height', shape: 'sphere', density_mode: 'height', composite_mode: 'physical', intent: 'physical_medium', edge_feather: 0.14, expected: 'ANALYTIC_LOCAL_QUADRATURE' },
        { id: 'sphere_cloud', shape: 'sphere', density_mode: 'cloud', composite_mode: 'physical', intent: 'physical_medium', expected: 'VOLUMETRIC_RAYMARCH' },
        { id: 'light_shafts', shape: 'box', density_mode: 'uniform', composite_mode: 'shafts', intent: 'god_rays', expected: 'SCREEN_SHAFTS' }
    ]);

    const MODE_IDS = Object.freeze([
        'classic',
        'pbr_metallic_roughness',
        'lightflow',
        'cinematic_craft'
    ]);

    const MODE_LABELS = Object.freeze({
        classic: 'Classic',
        pbr_metallic_roughness: 'Lightflow PBR',
        lightflow: 'Lightflow',
        cinematic_craft: 'Rendercraft'
    });

    const MATERIAL_OVERRIDE_FIELDS = Object.freeze([
        'sa_material_id',
        'sa_material_instance_id',
        'sa_face_material_instance_ids',
        'sa_auto_tile',
        'sa_face_auto_tile',
        'sa_mesh_face_auto_tile'
    ]);

    const WATCHED_BLOCKBENCH_EVENTS = Object.freeze([
        'load_project',
        'new_project',
        'select_project',
        'close_project',
        'convert_project',
        'select_format',
        'select_mode',
        'save_project',
        'saved_project',
        'update_scene_shading',
        'lightflow_environment_changed',
        'change_view_mode',
        'update_transform',
        'display_animation_frame',
        'studio_render_pre_tile',
        'studio_render_complete',
        'lightflow_frame_pipeline_ready',
        'lightflow_frame_pipeline_disposed'
    ]);

    function now() {
        return typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
    }

    function wallIso() {
        return new Date().toISOString();
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, number));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    }

    function nextFrame() {
        return new Promise(resolve => {
            let settled = false;
            let frame = null;
            let timer = null;
            const finish = value => {
                if (settled) return;
                settled = true;
                if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
                if (timer !== null) clearTimeout(timer);
                resolve(value);
            };
            if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(finish);
            // A hidden/minimized Electron window may suspend RAF indefinitely.
            // Resolve eventually so cancellation and restoration remain reliable;
            // Keep the >=1s gap in raw pacing data for later diagnosis.
            timer = setTimeout(() => finish(now()), frame !== null ? 1100 : 16);
        });
    }

    async function frames(count) {
        for (let i = 0; i < Math.max(0, count | 0); i++) await nextFrame();
    }

    async function waitForProfilerGpuResults(preview, options = {}) {
        const started = now();
        const timeoutMs = clamp(options.timeoutMs ?? 2500, 250, 10000);
        const minimumSamples = Math.max(1, Math.round(Number(options.minimumSamples) || 3));
        let statistics = null;
        while (now() - started < timeoutMs) {
            if (activeRunner?.cancelled && !activeRunner.restoring) throw new Error('Lightflow Test Lab run cancelled.');
            statistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
            const samples = Math.max(0, Number(statistics?.frameGpu?.samples) || 0);
            if (statistics && !statistics.gpuSupported) {
                return {
                    ok: false,
                    reason: 'gpu_timer_query_unsupported',
                    durationMs: round(now() - started),
                    statistics: toSerializable(statistics)
                };
            }
            if (statistics?.gpuDisjoint) {
                return {
                    ok: false,
                    reason: 'gpu_timer_query_disjoint',
                    durationMs: round(now() - started),
                    statistics: toSerializable(statistics)
                };
            }
            if (samples >= minimumSamples) {
                return {
                    ok: true,
                    reason: 'samples_ready',
                    durationMs: round(now() - started),
                    samples,
                    pendingGpuQueries: Math.max(0, Number(statistics.pendingGpuQueries) || 0),
                    statistics: toSerializable(statistics)
                };
            }
            await nextFrame();
        }
        statistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), statistics);
        return {
            ok: false,
            reason: 'gpu_timer_query_drain_timeout',
            durationMs: round(now() - started),
            samples: Math.max(0, Number(statistics?.frameGpu?.samples) || 0),
            pendingGpuQueries: Math.max(0, Number(statistics?.pendingGpuQueries) || 0),
            statistics: toSerializable(statistics)
        };
    }

    function buildStudioPostBenchmarkCases(config = DEFAULT_CONFIG) {
        const hdResolution = Array.isArray(config.studioHdResolution)
            ? config.studioHdResolution.slice(0, 2)
            : DEFAULT_CONFIG.studioHdResolution.slice();
        const uhdResolution = Array.isArray(config.studioUhdResolution)
            ? config.studioUhdResolution.slice(0, 2)
            : DEFAULT_CONFIG.studioUhdResolution.slice();
        const samples = Array.isArray(config.studioPostBenchmarkSamples)
            ? Array.from(new Set(config.studioPostBenchmarkSamples.map(value => (
                Math.round(clamp(value, 1, 8))
            )))).sort((left, right) => left - right)
            : DEFAULT_CONFIG.studioPostBenchmarkSamples.slice();
        if (!samples.includes(1)) samples.unshift(1);
        const maxSamples = samples[samples.length - 1];
        const cases = [
            {
                id: '41.studio.post.baseline.hd.1x',
                label: `Studio post baseline ${hdResolution.join('x')} 1x (AO OFF / Bloom OFF)`,
                kind: 'baseline', resolutionClass: 'hd', resolution: hdResolution,
                samples: 1, aoEnabled: false, bloomEnabled: false, verifyPostQuality: false
            },
            {
                id: '42.studio.post.ao_only.hd.1x',
                label: `Studio AO-only ${hdResolution.join('x')} 1x`,
                kind: 'ao_only', resolutionClass: 'hd', resolution: hdResolution,
                samples: 1, aoEnabled: true, bloomEnabled: false, verifyPostQuality: true
            },
            {
                id: '43.studio.post.bloom_only.hd.1x',
                label: `Studio Bloom-only ${hdResolution.join('x')} 1x`,
                kind: 'bloom_only', resolutionClass: 'hd', resolution: hdResolution,
                samples: 1, aoEnabled: false, bloomEnabled: true, verifyPostQuality: true
            },
            {
                id: '44.studio.post.combined.hd.1x',
                label: `Studio AO + Bloom ${hdResolution.join('x')} 1x`,
                kind: 'combined', resolutionClass: 'hd', resolution: hdResolution,
                samples: 1, aoEnabled: true, bloomEnabled: true, verifyPostQuality: true
            }
        ];
        samples.filter(value => value !== 1).forEach((sampleCount, index) => {
            cases.push({
                id: `${45 + index}.studio.post.combined.hd.${sampleCount}x`,
                label: `Studio AO + Bloom ${hdResolution.join('x')} ${sampleCount}x`,
                kind: 'combined', resolutionClass: 'hd', resolution: hdResolution,
                samples: sampleCount, aoEnabled: true, bloomEnabled: true, verifyPostQuality: true
            });
        });
        samples.forEach((sampleCount, index) => {
            cases.push({
                id: `${46 + index}.studio.post.combined.uhd.${sampleCount}x`,
                label: `Studio AO + Bloom ${uhdResolution.join('x')} ${sampleCount}x`,
                kind: 'combined', resolutionClass: 'uhd', resolution: uhdResolution,
                samples: sampleCount, aoEnabled: true, bloomEnabled: true, verifyPostQuality: true
            });
        });
        const repeatCount = Math.round(clamp(config.studioPostBenchmarkWarmRepeats, 0, 3));
        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
            cases.push({
                id: `${48 + repeatIndex}.studio.post.combined.hd.${maxSamples}x.reuse_${repeatIndex + 1}`,
                label: `Studio AO + Bloom ${hdResolution.join('x')} ${maxSamples}x prepared reuse ${repeatIndex + 1}`,
                kind: 'combined', resolutionClass: 'hd', resolution: hdResolution,
                samples: maxSamples, aoEnabled: true, bloomEnabled: true,
                verifyPostQuality: true, reuse: true, repeatIndex: repeatIndex + 1
            });
        }
        return cases;
    }

    function estimateScenarioCount(config) {
        if (config.suite === 'workflow') return (config.runPreflight ? 1 : 0) + 1 +
            (config.workflowArtKeyBatchModes || config.workflowArtKeyCacheModes || config.workflowRenderReuseModes).length * (config.workflowWorldEdits ? 5 : 3) + (config.runLeakAudit ? 1 : 0);
        if (config.suite === 'manual_workflow') return (config.runPreflight ? 1 : 0) + 2;
        if (config.suite === 'shader_compilation') return 4 + (config.runPreflight ? 1 : 0) +
            (config.bootstrapProject ? 1 : 0) + (config.runLeakAudit ? 1 : 0);
        if (config.suite === 'volume_complete') {
            return (config.runPreflight ? 1 : 0) + 1 + 3 + 13 + (config.runLeakAudit ? 1 : 0);
        }
        let total = config.runPreflight ? 1 : 0;
        const modeIds = Array.isArray(config.modeIds) && config.modeIds.length
            ? config.modeIds
            : MODE_IDS;
        // Warm-up stability is always the first runtime gate.
        total += 1;
        const hasOverrides = !!safe(
            () => root.ShaderEngine?.projectHasMaterialOverrides?.(),
            false
        );
        if (config.runCoreScenarios) {
            total += 1;
            if (config.bootstrapProject) total += 1;
            if (config.runVolumeMatrix) total += 16;
            if (config.runCamera) total += 1;
            if (config.runEditTransform) total += 1;
            if (config.runAnimation) total += 1;
            if (config.runLightTests) total += 4;
            if (config.runFeatureToggles) {
                total += 4; // AO and viewport Bloom ON/OFF, or their skip records.
            }
            if (config.runFeatureIsolation) total += 10;
            const perBasicMode = 2 + (config.runCamera ? 1 : 0);
            const perInteractivePair =
                (config.runEditTransform ? 1 : 0) +
                (config.runAnimation ? 1 : 0);
            const interactiveModes = modeIds.filter(mode => (
                mode === 'lightflow' || mode === 'cinematic_craft'
            )).length;
            if (config.runNoOverridesFixture) {
                total += 2 + modeIds.length * perBasicMode;
                if (hasOverrides && config.runModeCycle && config.runOverrideModeCycle) {
                    total += modeIds.length * perBasicMode + interactiveModes * perInteractivePair;
                }
            } else if (config.runModeCycle) {
                total += modeIds.length * perBasicMode + interactiveModes * perInteractivePair;
            }
            if (config.includeStudio && config.suite !== 'quick') {
                if (!root.StudioRender?.render) {
                    total += 1;
                } else {
                    if (config.runStudioQualityContract) total += 2;
                    if (config.runStudioPostBenchmark) {
                        total += buildStudioPostBenchmarkCases(config).length;
                    }
                    if (config.studioModeMatrix && hasOverrides) total += 1;
                    const modes = config.studioModeMatrix ? MODE_IDS : [getMode() || 'cinematic_craft'];
                    total += modes.length * 2;
                    total += modes.filter(mode => (config.studioHdModes || []).includes(mode)).length;
                    if (config.includeHeavyStudio) {
                        total += 1;
                        const heavyRepeatCount = config.studioRepeatHeavy === true
                            ? 1
                            : Math.max(0, Math.floor(Number(config.studioRepeatHeavy) || 0));
                        total += heavyRepeatCount;
                    }
                    if (config.studioModeMatrix && hasOverrides) {
                        total += 2; // restore overrides + override smoke render
                        const finalMatrixMode = config.includeHeavyStudio
                            ? 'cinematic_craft'
                            : modes[modes.length - 1];
                        if (getMode() && getMode() !== finalMatrixMode) total += 1;
                    }
                }
            }
        }
        if (config.runAnimationMatrix) {
            const animationModes = Array.isArray(config.animationModeIds) && config.animationModeIds.length
                ? config.animationModeIds
                : MODE_IDS;
            const shadowStates = Array.isArray(config.animationShadowStates) && config.animationShadowStates.length
                ? config.animationShadowStates
                : ['current'];
            total += animationModes.length * (1 + shadowStates.length);
        }
        if (config.runAnimationIsolation) total += 10;
        if (config.runStress) total += config.stressSceneOnly ? 1 : 6;
        if (config.runProjectSwitching) total += 1;
        if (config.runSoak) total += 1;
        if (config.runContextRecovery) total += 1;
        if (config.runLeakAudit) total += 1;
        return Math.max(1, total);
    }

    class ProgressPresenter {
        constructor(config, report) {
            this.config = config;
            this.report = report;
            this.total = estimateScenarioCount(config);
            this.completed = 0;
            this.passed = 0;
            this.failed = 0;
            this.skipped = 0;
            this.currentFraction = 0;
            this.currentId = '';
            this.currentLabel = '';
            this.startedAt = now();
            this.lastConsoleBucket = -1;
            this.element = null;
            this.bar = null;
            this.percentNode = null;
            this.labelNode = null;
            this.detailNode = null;
            this.createHud();
            this.render('Preparing test plan');
        }

        createHud() {
            if (!this.config.showProgressHud || !root.document?.body) return;
            const element = root.document.createElement('div');
            element.id = 'lightflow_test_lab_progress_v2';
            Object.assign(element.style, {
                position: 'fixed', right: '18px', bottom: '18px', width: '360px',
                zIndex: '100000', padding: '14px 16px', borderRadius: '10px',
                background: 'rgba(18, 21, 27, 0.96)', color: '#f2f4f8',
                boxShadow: '0 12px 38px rgba(0,0,0,0.42)',
                fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: '12px',
                pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.12)'
            });
            const header = root.document.createElement('div');
            Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', gap: '12px', fontWeight: '600' });
            const title = root.document.createElement('span');
            title.textContent = `Lightflow Test Lab · ${this.config.suite}`;
            this.percentNode = root.document.createElement('span');
            this.percentNode.textContent = '0%';
            header.append(title, this.percentNode);
            const track = root.document.createElement('div');
            Object.assign(track.style, {
                height: '7px', margin: '10px 0', borderRadius: '999px',
                overflow: 'hidden', background: 'rgba(255,255,255,0.12)'
            });
            this.bar = root.document.createElement('div');
            Object.assign(this.bar.style, {
                width: '0%', height: '100%', borderRadius: 'inherit',
                background: '#66d9ef', transition: 'width 160ms linear, background 160ms ease'
            });
            track.appendChild(this.bar);
            this.labelNode = root.document.createElement('div');
            Object.assign(this.labelNode.style, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
            this.detailNode = root.document.createElement('div');
            Object.assign(this.detailNode.style, { marginTop: '5px', color: 'rgba(242,244,248,0.68)' });
            element.append(header, track, this.labelNode, this.detailNode);
            root.document.body.appendChild(element);
            this.element = element;
        }

        get percentage() {
            const progress = (this.completed + Math.min(0.95, Math.max(0, this.currentFraction))) /
                Math.max(1, this.total);
            return Math.min(99, Math.max(0, Math.floor(progress * 100)));
        }

        record(kind, extra = {}) {
            const item = {
                atMs: round(now() - this.startedAt),
                kind,
                percentage: kind === 'finished' ? 100 : this.percentage,
                completed: this.completed,
                total: this.total,
                currentId: this.currentId || null,
                currentLabel: this.currentLabel || null,
                ...extra
            };
            this.report.progressEvents.push(item);
            return item;
        }

        beginScenario(id, label) {
            if (this.completed >= this.total) this.total = this.completed + 1;
            this.currentId = id;
            this.currentLabel = label;
            this.currentFraction = 0;
            this.record('scenario_started');
            this.render(`Running ${id}`);
        }

        setCurrentFraction(value, detail = '') {
            this.currentFraction = clamp(value, 0, 0.95);
            this.render(detail);
        }

        completeScenario(status) {
            this.currentFraction = 0;
            this.completed += 1;
            if (status === 'passed') this.passed += 1;
            else if (status === 'failed') this.failed += 1;
            else this.skipped += 1;
            this.record('scenario_finished', { status });
            this.currentId = '';
            this.currentLabel = '';
            this.render(status === 'failed' ? 'Failure captured; continuing' : 'Scenario complete');
        }

        render(detail = '') {
            const percentage = this.percentage;
            if (this.percentNode) this.percentNode.textContent = `${percentage}%`;
            if (this.bar) {
                this.bar.style.width = `${percentage}%`;
                this.bar.style.background = this.failed ? '#ff6b6b' : '#66d9ef';
            }
            if (this.labelNode) {
                this.labelNode.textContent = this.currentLabel || detail || 'Finalizing report';
            }
            if (this.detailNode) {
                const elapsed = Math.max(0, now() - this.startedAt);
                const rate = this.completed > 0 ? elapsed / this.completed : 0;
                const remaining = Math.max(0, this.total - this.completed);
                const etaSeconds = rate > 0 ? Math.round(rate * remaining / 1000) : null;
                this.detailNode.textContent = [
                    `${this.completed}/${this.total}`,
                    `${this.passed} PASS`, `${this.failed} FAIL`, `${this.skipped} SKIP`,
                    etaSeconds === null ? 'ETA calculating' : `ETA ~${etaSeconds}s`
                ].join(' · ');
            }
            const step = Math.max(1, Number(this.config.progressConsoleStep) || 5);
            const bucket = Math.floor(percentage / step);
            if (bucket !== this.lastConsoleBucket) {
                this.lastConsoleBucket = bucket;
                console.info(
                    `[Lightflow Test Lab] ${percentage}% · ${this.completed}/${this.total} · ` +
                    `${this.currentLabel || detail || 'finalizing'}`
                );
            }
        }

        finish(summary = {}) {
            this.total = Math.max(1, this.completed);
            this.completed = this.total;
            this.currentFraction = 0;
            this.currentId = '';
            this.currentLabel = 'Test session complete';
            this.record('finished', { summary: toSerializable(summary) });
            if (this.percentNode) this.percentNode.textContent = '100%';
            if (this.bar) {
                this.bar.style.width = '100%';
                this.bar.style.background = summary.failed ? '#ff6b6b' : '#69db7c';
            }
            if (this.labelNode) this.labelNode.textContent = 'Test session complete';
            if (this.detailNode) {
                this.detailNode.textContent = `${summary.passed || 0} PASS · ${summary.failed || 0} FAIL · ${summary.skipped || 0} SKIP`;
            }
            setTimeout(() => this.destroy(), 12000);
        }

        snapshot() {
            return {
                percentage: this.currentLabel === 'Test session complete' ? 100 : this.percentage,
                completed: this.completed,
                total: this.total,
                passed: this.passed,
                failed: this.failed,
                skipped: this.skipped,
                currentId: this.currentId || null,
                currentLabel: this.currentLabel || null,
                elapsedMs: round(now() - this.startedAt)
            };
        }

        destroy() {
            this.element?.remove?.();
            this.element = null;
        }
    }

    function safe(fn, fallback = null) {
        try {
            const value = fn();
            return value === undefined ? fallback : value;
        } catch (error) {
            return fallback;
        }
    }

    function cloneJson(value, fallback = null) {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (error) { return fallback; }
    }

    function toSerializable(value, depth = 0, seen = new WeakSet()) {
        if (value === null || value === undefined) return value ?? null;
        const type = typeof value;
        if (type === 'string') {
            const maxLength = 16000;
            return value.length > maxLength
                ? `${value.slice(0, maxLength)}\n...[${value.length - maxLength} chars omitted by Test Lab]`
                : value;
        }
        if (type === 'number' || type === 'boolean') return value;
        if (type === 'bigint') return Number(value);
        if (type === 'function') return `[Function ${value.name || 'anonymous'}]`;
        if (type !== 'object') return String(value);
        if (depth > 5) return '[MaxDepth]';
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
        if (Array.isArray(value)) {
            return value.slice(0, 200).map(item => toSerializable(item, depth + 1, seen));
        }
        if (value instanceof Error) {
            return { name: value.name, message: value.message, stack: value.stack || '' };
        }
        if (value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isQuaternion || value?.isEuler) {
            return safe(() => value.toArray(), String(value));
        }
        const output = {};
        Object.keys(value).slice(0, 250).forEach(key => {
            const item = safe(() => value[key], '[GetterError]');
            output[key] = toSerializable(item, depth + 1, seen);
        });
        return output;
    }

    function pickSerializableFields(source, fields) {
        if (!source || typeof source !== 'object') return null;
        const output = {};
        (fields || []).forEach(field => {
            if (source[field] !== undefined) output[field] = toSerializable(source[field]);
        });
        return output;
    }

    function compactDiagnosticsTelemetry(diagnostics) {
        if (!diagnostics || typeof diagnostics !== 'object') {
            return { warmup: null, lifecycle: null, performance: null, performanceLimiter: null };
        }
        return {
            warmup: pickSerializableFields(diagnostics.shaderWarmup, [
                'state', 'parallelSupported', 'parallelEnabled', 'parallelActive',
                'parallelStrategy', 'maxConcurrentJobs', 'maxSubmissionsPerFrame',
                'submissionBudgetMs', 'submissions', 'deferredIntrospection',
                'completionPolls', 'finalizedPrograms', 'activeJobs', 'peakActiveJobs',
                'pendingPrograms', 'peakPendingPrograms', 'schedulerTasks',
                'schedulerUnitsLaunched', 'schedulerUnitsCompleted', 'schedulerFrames',
                'lastConcurrency', 'configuredConcurrency', 'effectiveConcurrency',
                'sourceComplexityClass', 'maxSourceChars', 'maxFragmentChars',
                'softBudgetWarnings', 'hardTimeouts', 'staleProgramRetries',
                'synchronousLinkFailures', 'linkValidationFailures', 'liveScenePrimes',
                'liveScenePrimeFailures', 'auxiliaryPrimes', 'auxiliaryPrimeFailures',
                'escapedPrograms', 'escapedFrames', 'escapedRecoveries', 'contextLosses',
                'contextRestores', 'contextRecoveryWarmups', 'worstSubmissionMs',
                'worstFinalizeMs', 'records', 'programKeys', 'queue', 'activeFailures',
                'lastCompileMs', 'completed', 'failed'
            ]),
            lifecycle: pickSerializableFields(diagnostics.lifecycle, [
                'projectEpoch', 'activeProjectId', 'phase', 'hydrated', 'hydrateProjectMs',
                'pendingHydrators', 'registeredHydrators', 'lastCause'
            ]),
            performance: pickSerializableFields(diagnostics.performance, [
                'activeMeshes', 'activeSceneBatches', 'activeInstancedBatches',
                'estimatedSceneDrawsPerFrame', 'rendererCallsLastFrame',
                'rendererTrianglesLastFrame', 'logicalFrameCpuMs', 'logicalFrameGpuMs',
                'logicalFramePasses', 'logicalFrameTargetSwitches', 'rendererPrograms',
                'gpuMaterials', 'rendererGeometries', 'rendererTextures', 'pooledMaterials',
                'renderBatches', 'renderBatchMembers', 'renderBatchSourceDraws',
                'savedRenderDraws', 'dynamicInstanceBatches', 'dynamicInstances',
                'dynamicInstanceSourceDraws', 'savedDynamicInstanceDraws',
                'batchingDiagnostics', 'sceneScalability', 'lightingScalability',
                'aoMotionCadence', 'ambientOcclusion',
                'rimMotionCadence',
                'projectResourceReuse',
                'materialRecipeCache', 'materialRecipeCacheHits', 'materialRecipeCacheMisses',
                'shaderSourceHashCache', 'fragmentShaderVariantCache', 'warmupQueue',
                'warmupCompleted', 'warmupFailed', 'warmupSkipped', 'warmupLastCause',
                'warmupLastDurationMs', 'warmupLastProgramDelta', 'renderBatchGeometryCache',
                'renderBatchGeometryCacheBytes'
            ]),
            performanceLimiter: toSerializable(diagnostics.performanceLimiter || null)
        };
    }

    function percentile(sorted, p) {
        if (!sorted.length) return null;
        const index = (sorted.length - 1) * clamp(p, 0, 1);
        const low = Math.floor(index);
        const high = Math.ceil(index);
        if (low === high) return sorted[low];
        const weight = index - low;
        return sorted[low] * (1 - weight) + sorted[high] * weight;
    }

    function round(value, digits = 3) {
        if (!Number.isFinite(Number(value))) return null;
        const scale = Math.pow(10, digits);
        return Math.round(Number(value) * scale) / scale;
    }

    function summarizeFrameDeltas(deltas, measuredDurationMs = null) {
        const values = (deltas || []).filter(value => Number.isFinite(value) && value >= 0);
        // RAF gaps of a second or more are normally tab/window throttling, sleep,
        // or the debugger, rather than a frame the renderer actually produced.
        // Keep them in the raw sample, but never let them masquerade as a clean
        // performance result.
        const schedulerPauseThresholdMs = 1000;
        if (!values.length) {
            return {
                frames: 0,
                measuredDurationMs: round(measuredDurationMs || 0),
                effectiveFps: 0,
                meanMs: null,
                medianMs: null,
                p90Ms: null,
                p95Ms: null,
                p99Ms: null,
                worstMs: null,
                fps1Low: null,
                fps01Low: null,
                gapsOver33ms: 0,
                gapsOver50ms: 0,
                gapsOver100ms: 0,
                gapsOver250ms: 0,
                schedulerPauseCount: 0,
                schedulerPausedMs: 0,
                activeDurationMs: round(measuredDurationMs || 0),
                activeEffectiveFps: 0,
                activeWorstMs: null
            };
        }
        const sorted = values.slice().sort((a, b) => a - b);
        const sum = values.reduce((total, value) => total + value, 0);
        const duration = Number.isFinite(measuredDurationMs) && measuredDurationMs > 0
            ? measuredDurationMs
            : sum;
        const p99 = percentile(sorted, 0.99);
        const p999 = percentile(sorted, 0.999);
        // A multi-second RAF gap without sampled frames is normally caused by
        // window suspension, display sleep, or OS scheduling, not a renderer
        // frame. Keep the raw wall-clock FPS, but also expose an active-runtime
        // metric so a paused benchmark cannot masquerade as a GPU regression.
        const schedulerPauses = values.filter(value => value >= schedulerPauseThresholdMs);
        const schedulerPausedMs = schedulerPauses.reduce((total, value) => total + value, 0);
        const activeValues = values.filter(value => value < schedulerPauseThresholdMs);
        const activeDuration = Math.max(0, duration - schedulerPausedMs);
        return {
            frames: values.length,
            measuredDurationMs: round(duration),
            effectiveFps: round(duration > 0 ? (values.length * 1000) / duration : 0, 2),
            meanMs: round(sum / values.length),
            medianMs: round(percentile(sorted, 0.5)),
            p90Ms: round(percentile(sorted, 0.9)),
            p95Ms: round(percentile(sorted, 0.95)),
            p99Ms: round(p99),
            worstMs: round(sorted[sorted.length - 1]),
            fps1Low: p99 > 0 ? round(1000 / p99, 2) : null,
            fps01Low: p999 > 0 ? round(1000 / p999, 2) : null,
            gapsOver33ms: values.filter(value => value > 33.333).length,
            gapsOver50ms: values.filter(value => value > 50).length,
            gapsOver100ms: values.filter(value => value > 100).length,
            gapsOver250ms: values.filter(value => value > 250).length,
            schedulerPauseCount: schedulerPauses.length,
            schedulerPausedMs: round(schedulerPausedMs),
            activeDurationMs: round(activeDuration),
            activeEffectiveFps: round(
                activeDuration > 0 ? (activeValues.length * 1000) / activeDuration : 0,
                2
            ),
            activeWorstMs: activeValues.length
                ? round(activeValues.reduce((maximum, value) => Math.max(maximum, value), 0))
                : null
        };
    }

    function summarizeFramePacing(deltas) {
        const values = (deltas || []).filter(value => Number.isFinite(value) && value >= 0 && value < 5000);
        const targets = [144, 120, 90, 60];
        const tiers = {};
        targets.forEach(fps => {
            const budgetMs = 1000 / fps;
            const missed = values.filter(value => value > budgetMs * 1.08).length;
            tiers[fps] = {
                budgetMs: round(budgetMs),
                missedFrames: missed,
                missedRatio: values.length ? round(missed / values.length, 4) : null
            };
        });
        let currentTier = 'below_60';
        const p95 = values.length ? percentile(values.slice().sort((a, b) => a - b), 0.95) : null;
        if (p95 !== null) {
            if (p95 <= (1000 / 144) * 1.08) currentTier = '144';
            else if (p95 <= (1000 / 120) * 1.08) currentTier = '120';
            else if (p95 <= (1000 / 90) * 1.08) currentTier = '90';
            else if (p95 <= (1000 / 60) * 1.08) currentTier = '60';
        }
        return {
            samples: values.length,
            p95Tier: currentTier,
            tiers
        };
    }

    function csvEscape(value) {
        if (value === null || value === undefined) return '';
        const string = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
    }

    function objectDelta(before, after, keys) {
        const output = {};
        (keys || []).forEach(key => {
            const a = Number(before?.[key]);
            const b = Number(after?.[key]);
            output[key] = Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
        });
        return output;
    }

    function capturePreviewPng() {
        const preview = getPreview();
        const canvas = preview?.renderer?.domElement || preview?.canvas;
        if (!canvas?.toDataURL) return null;
        try {
            preview.render?.();
            const value = canvas.toDataURL('image/png');
            return typeof value === 'string' && value.startsWith('data:image/png;base64,') ? value : null;
        } catch (error) {
            return null;
        }
    }

    function capturePreviewPixels() {
        if (typeof document === 'undefined') return null;
        const preview = getPreview();
        const source = preview?.renderer?.domElement || preview?.canvas;
        const width = Math.max(1, Number(source?.width) || 0);
        const height = Math.max(1, Number(source?.height) || 0);
        if (!source || !width || !height) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return null;
            context.drawImage(source, 0, 0, width, height);
            return { width, height, data: context.getImageData(0, 0, width, height).data };
        } catch (error) {
            return null;
        }
    }

    function captureCanvasPixels(source) {
        if (typeof document === 'undefined' || !source) return null;
        const width = Math.max(1, Number(source.width) || 0);
        const height = Math.max(1, Number(source.height) || 0);
        if (!width || !height) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return null;
            context.drawImage(source, 0, 0, width, height);
            return { width, height, data: context.getImageData(0, 0, width, height).data };
        } catch (error) {
            return null;
        }
    }

    function captureCanvasPng(source) {
        if (!source?.toDataURL) return null;
        try {
            const value = source.toDataURL('image/png');
            return typeof value === 'string' && value.startsWith('data:image/png;base64,') ? value : null;
        } catch (error) {
            return null;
        }
    }

    function hashPixelFrame(frame) {
        if (!frame?.data) return null;
        let hash = 2166136261;
        for (let index = 0; index < frame.data.length; index++) {
            hash ^= frame.data[index];
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function mapVolumeBoundsToCapture(projected, viewport, capture) {
        if (!projected || !(viewport?.z > 0) || !(viewport?.w > 0) || !capture) return null;
        // The last Atmosphere consumer may be a reduced Bloom target; Canvas
        // captures use full drawing-buffer pixels. Bounds are viewport-local.
        const scaleX = capture.width / viewport.z;
        const scaleY = capture.height / viewport.w;
        return { x: projected.x * scaleX, y: projected.y * scaleY,
            width: projected.width * scaleX, height: projected.height * scaleY };
    }

    function compareVolumePixels(before, after, physicalRect = null) {
        if (!before?.data || !after?.data || before.width !== after.width || before.height !== after.height) {
            return { available: false, reason: 'pixel_capture_unavailable_or_size_changed' };
        }
        const width = after.width;
        const height = after.height;
        const rect = physicalRect ? {
            x: Math.max(0, Math.floor(Number(physicalRect.x) || 0)),
            y: Math.max(0, Math.floor(Number(physicalRect.y) || 0)),
            width: Math.max(0, Math.ceil(Number(physicalRect.width) || 0)),
            height: Math.max(0, Math.ceil(Number(physicalRect.height) || 0))
        } : null;
        let changedPixels = 0;
        let outsideChangedPixels = 0;
        let newlyClippedPixels = 0;
        let totalDelta = 0;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let pixel = 0; pixel < width * height; pixel++) {
            const offset = pixel * 4;
            const delta = Math.abs(after.data[offset] - before.data[offset]) +
                Math.abs(after.data[offset + 1] - before.data[offset + 1]) +
                Math.abs(after.data[offset + 2] - before.data[offset + 2]);
            if (delta <= 9) continue;
            const x = pixel % width;
            const topY = Math.floor(pixel / width);
            const glY = height - 1 - topY;
            changedPixels++;
            totalDelta += delta;
            minX = Math.min(minX, x);
            minY = Math.min(minY, topY);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, topY);
            if (rect && !(
                x >= rect.x - 3 && x < rect.x + rect.width + 3 &&
                glY >= rect.y - 3 && glY < rect.y + rect.height + 3
            )) outsideChangedPixels++;
            const nowClipped = after.data[offset] >= 250 && after.data[offset + 1] >= 250 && after.data[offset + 2] >= 250;
            const wasClipped = before.data[offset] >= 250 && before.data[offset + 1] >= 250 && before.data[offset + 2] >= 250;
            if (nowClipped && !wasClipped) newlyClippedPixels++;
        }
        return {
            available: true,
            width,
            height,
            changedPixels,
            changedFraction: round(changedPixels / Math.max(1, width * height), 6),
            outsideChangedPixels,
            outsideChangedRatio: round(outsideChangedPixels / Math.max(1, changedPixels), 6),
            newlyClippedPixels,
            newlyClippedRatio: round(newlyClippedPixels / Math.max(1, changedPixels), 6),
            meanRgbDelta: round(totalDelta / Math.max(1, changedPixels * 3), 3),
            changedBounds: changedPixels ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
            expectedPhysicalRect: rect
        };
    }

    function cloneDiagnosticValue(value) {
        if (Array.isArray(value)) return value.slice();
        if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value));
        return value;
    }

    function snapshotVolumeConfig(volume) {
        const source = safe(() => volume?.getSaveCopy?.(), null) || volume || {};
        const result = {};
        Object.keys(source).forEach(key => {
            if (key !== 'uuid' && key !== 'type') result[key] = cloneDiagnosticValue(source[key]);
        });
        return result;
    }

    function applyDiagnosticVolumeConfig(volume, config = {}) {
        if (!volume) return;
        Object.entries(config).forEach(([key, value]) => {
            if (key === 'id' || key === 'expected') return;
            volume[key] = cloneDiagnosticValue(value);
        });
        root.LightflowVolumeElement?.preview_controller?.updateTransform?.(volume);
        root.LightflowAtmosphere?.invalidateSceneCache?.();
    }

    function removeDiagnosticVolume(volume) {
        if (!volume) return;
        safe(() => volume.remove?.(), null);
        safe(() => root.Blockbench?.dispatchEvent?.('remove_lightflow_volume', {
            object: volume,
            source: 'lightflow_test_lab'
        }), null);
        root.LightflowAtmosphere?.invalidateSceneCache?.();
    }

    function buildEnvironmentSnapshot() {
        const preview = getPreview();
        const renderer = preview?.renderer || null;
        const gl = safe(() => renderer?.getContext?.(), null);
        let debugRenderer = null;
        let debugVendor = null;
        if (gl) {
            const ext = safe(() => gl.getExtension('WEBGL_debug_renderer_info'), null);
            if (ext) {
                debugRenderer = safe(() => gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), null);
                debugVendor = safe(() => gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), null);
            }
        }
        const processArgv = safe(() => {
            const proc = root.process || (typeof process !== 'undefined' ? process : null);
            return Array.isArray(proc?.argv) ? proc.argv.slice() : null;
        }, null);
        const processVersions = safe(() => {
            const proc = root.process || (typeof process !== 'undefined' ? process : null);
            return proc?.versions || null;
        }, null);
        const parseUaVersion = name => {
            const userAgent = safe(() => navigator.userAgent, '');
            const match = String(userAgent || '').match(new RegExp(`${name}\\/([0-9.]+)`, 'i'));
            return match ? match[1] : null;
        };
        const hasLaunchSwitch = name => Array.isArray(processArgv)
            ? processArgv.includes(name)
            : null;

        return {
            capturedAt: wallIso(),
            platform: {
                isApp: !!root.isApp,
                isMobile: !!root.Blockbench?.isMobile,
                visibilityState: safe(() => root.document?.visibilityState, null),
                documentHidden: safe(() => !!root.document?.hidden, null),
                hasFocus: safe(() => root.document?.hasFocus?.(), null),
                userAgent: safe(() => navigator.userAgent, null),
                language: safe(() => navigator.language, null),
                hardwareConcurrency: safe(() => navigator.hardwareConcurrency, null),
                deviceMemoryGB: safe(() => navigator.deviceMemory, null),
                screen: safe(() => ({
                    width: screen.width,
                    height: screen.height,
                    pixelRatio: root.devicePixelRatio || 1
                }), null)
            },
            host: {
                blockbenchVersion: root.appVersion || root.Blockbench?.version || null,
                threeRevision: root.THREE?.REVISION || null,
                electron: processVersions?.electron || parseUaVersion('Electron'),
                node: processVersions?.node || null,
                chrome: processVersions?.chrome || parseUaVersion('Chrome'),
                processArgumentsAvailable: Array.isArray(processArgv),
                processSwitches: Array.isArray(processArgv)
                    ? processArgv.filter(arg => String(arg).startsWith('--'))
                    : null,
                // `null` means Electron did not expose argv to the renderer. v1 used
                // `false` here, which incorrectly claimed the user's launch flags
                // were absent in both supplied Desktop reports.
                shaderDiskCacheDisabled: hasLaunchSwitch('--disable-gpu-shader-disk-cache'),
                gpuProgramCacheDisabled: hasLaunchSwitch('--disable-gpu-program-cache')
            },
            webgl: {
                isWebGL2: !!renderer?.capabilities?.isWebGL2,
                debugRenderer,
                debugVendor,
                contextLost: !!safe(() => gl?.isContextLost?.(), false),
                capabilities: toSerializable(root.LightflowRenderer?.getCapabilities?.(renderer, { probeHalfFloat: true }))
            },
            lightflow: {
                rendererApi: root.LightflowRenderer?.version || null,
                shaderArchitectVersion: safe(() => root.Plugins?.all?.find(p => p.id === 'shader_architect')?.version, null),
                lightManagerVersion: safe(() => root.Plugins?.all?.find(p => p.id === 'light_manager')?.version, null),
                studioRenderVersion: safe(() => root.Plugins?.all?.find(p => p.id === 'studio_render')?.version, null),
                testLabVersion: LAB_VERSION
            },
            project: {
                name: root.Project?.name || null,
                format: root.Format?.id || null,
                elements: safe(() => root.Outliner?.elements?.length, null),
                cubes: safe(() => root.Cube?.all?.length, null),
                meshes: safe(() => root.Mesh?.all?.length, null),
                textures: safe(() => root.Texture?.all?.length, null),
                animations: safe(() => root.Animation?.all?.length, null),
                lights: safe(() => root.LightElement?.all?.length, null),
                hasMaterialOverrides: !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false)
            }
        };
    }

    function getPreview() {
        return root.Preview?.selected || root.main_preview || root.Preview?.all?.find?.(preview => preview?.renderer) || null;
    }

    function buildPerformanceBootstrapFixture(index = 0, options = {}) {
        const suffix = `${Math.max(0, Number(index) || 0)}`;
        const id = slot => `f1a00000-0000-4000-8000-${(Math.max(0, Number(index) || 0) * 100 + slot).toString(16).padStart(12, '0')}`;
        const cube = (slot, name, from, to) => ({
            uuid: id(slot),
            name,
            type: 'cube', from, to,
            box_uv: false,
            faces: Object.fromEntries(['north', 'south', 'east', 'west', 'up', 'down'].map(face => [face, { uv: [0, 0, 16, 16], texture: 0 }]))
        });
        const group = { uuid: id(10), name: 'moving_group', origin: [0, 0, 0], rotation: [0, 0, 0], children: [id(2)] };
        const lights = options.includeLights === false ? [] : [{
            uuid: id(4), type: 'light', name: 'fixture_key', light_type: 'point',
            position: [8, 12, 8], rotation: [0, 0, 0], color: [255, 220, 180],
            intensity: 2, distance: 48, visibility: true, has_shadow: true,
            shadow_resolution: 512, shadow_near: 0.1, shadow_far: 100, shadow_bounds: 35
        }];
        return {
            meta: { format_version: '5.0', model_format: 'bedrock', box_uv: false },
            name: `Lightflow Test Lab Temporary ${suffix}`,
            resolution: { width: 16, height: 16 },
            elements: [
                cube(1, 'ground', [-12, -1, -12], [12, 0, 12]),
                cube(2, 'animated_target', [-2, 0, -2], [2, 4 + Number(index), 2]),
                cube(3, 'occluder', [3, 0, -1], [5, 5, 1]),
                ...lights
            ],
            groups: [{ uuid: group.uuid, name: group.name, origin: group.origin, rotation: group.rotation }],
            outliner: [id(1), group, id(3), ...lights.map(light => light.uuid)],
            textures: [{ uuid: id(20), name: 'fixture_checker', mode: 'bitmap', saved: false,
                source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGPIy8v7j4zv3LmDggnJMwwDA0jVgC4/HAwY+FgYeAMGPhYG3AAARk3uH2QL7QwAAAAASUVORK5CYII=' }],
            animations: options.includeAnimation === false ? [] : [{
                uuid: id(30), name: 'fixture.motion', loop: 'loop', length: 2, snapping: 20,
                animators: { [group.uuid]: { name: group.name, type: 'bone', keyframes: [0, 1, 2].map((time, key) => ({
                    uuid: id(31 + key), channel: 'rotation', time, interpolation: 'linear',
                    data_points: [{ x: 0, y: time === 1 ? 65 : 0, z: 0 }]
                })) } }
            }],
            lightflow_test_lab: { temporary: true, fixture: 'performance', includeAnimation: options.includeAnimation !== false }
        };
    }

    class PerformanceProjectSession {
        constructor(host = root, options = {}) {
            this.host = host;
            this.options = options;
            this.originalProject = host.Project || null;
            this.originalProjects = new Set(host.ModelProject?.all || []);
            if (this.originalProject) this.originalProjects.add(this.originalProject);
            this.owned = [];
            this.models = [];
            this.operations = [];
        }
        async openFixture(index) {
            const model = buildPerformanceBootstrapFixture(index, this.options);
            const codec = this.host.Codecs?.project;
            if (!codec?.load) throw new Error('Blockbench project codec is unavailable for temporary performance fixtures.');
            if (!Array.isArray(this.host.ModelProject?.all)) throw new Error('ModelProject registry is unavailable.');
            this.options.assertActive?.();
            const before = new Set(this.host.ModelProject.all);
            const started = now();
            let created = [];
            try {
                // Native load is synchronous. Register ownership before yielding:
                // parse may throw after setupProject has already opened a tab.
                const result = codec.load(model, { path: '', no_file: true });
                if (result?.then) throw new Error('Asynchronous project codecs are unsupported for owned fixtures.');
            } finally {
                created = this.host.ModelProject.all.filter(project => !before.has(project) && !this.originalProjects.has(project));
                for (const project of created) {
                    if (!this.owned.includes(project)) this.owned.push(project);
                }
                this.operations.push({ operation: 'open', fixture: index, callMs: round(now() - started), created: created.map(project => project.uuid) });
            }
            const project = this.host.Project;
            if (!created.includes(project)) throw new Error('Project codec did not activate a new temporary project.');
            if (typeof project.close !== 'function') throw new Error('Temporary project has no native close API.');
            this.models.push(model);
            if (this.options.settle) await this.options.settle(project);
            this.options.assertActive?.();
            return project;
        }
        async openFixtures(count = 2) {
            const projects = [];
            for (let index = 0; index < Math.round(clamp(count, 2, 4)); index++) projects.push(await this.openFixture(index));
            return projects;
        }
        async closeOwned() {
            const errors = [];
            for (const project of this.owned.slice().reverse()) {
                if (this.originalProjects.has(project)) continue;
                try {
                    if (this.host.ModelProject.all.includes(project)) {
                        if (typeof project.close !== 'function') throw new Error('Native project close API is unavailable.');
                        const started = now();
                        const result = await project.close(true);
                        if (result === false || this.host.ModelProject.all.includes(project)) throw new Error('Temporary project refused to close.');
                        this.operations.push({ operation: 'close', projectId: project.uuid, callMs: round(now() - started) });
                    }
                    this.owned.splice(this.owned.indexOf(project), 1);
                } catch (error) {
                    errors.push({ projectId: project?.uuid, message: error.message });
                }
            }
            if (errors.length) {
                const error = new Error('Some temporary projects could not be closed.');
                error.projects = errors;
                throw error;
            }
        }
        async restore() {
            if (this.originalProject?.select && this.host.ModelProject?.all?.includes(this.originalProject) && this.host.Project !== this.originalProject) {
                this.originalProject.select();
                if (this.options.restoreSettle) await this.options.restoreSettle(this.originalProject);
            }
        }
        async dispose() {
            try { await this.closeOwned(); }
            finally { await this.restore(); }
        }
    }

    function getRendererSnapshot() {
        const preview = getPreview();
        const renderer = preview?.renderer;
        if (!renderer) return null;
        const info = renderer.info || {};
        return {
            calls: info.render?.calls ?? null,
            triangles: info.render?.triangles ?? null,
            points: info.render?.points ?? null,
            lines: info.render?.lines ?? null,
            programs: Array.isArray(info.programs) ? info.programs.length : null,
            textures: info.memory?.textures ?? null,
            geometries: info.memory?.geometries ?? null
        };
    }

    function hashDiagnosticString(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function classifyRendererProgram(program) {
        const name = String(program?.name || 'unknown');
        if (/MeshDepthMaterial/i.test(name)) return 'shadow_depth';
        if (/MeshDistanceMaterial/i.test(name)) return 'shadow_distance';
        if (/Line/i.test(name)) return 'line_helper';
        if (/Sprite/i.test(name)) return 'sprite_helper';
        if (/Points/i.test(name)) return 'points_helper';
        if (/ShaderMaterial/i.test(name)) return 'shader_surface_or_aux';
        return 'native_surface_or_helper';
    }

    function getRendererProgramInventory() {
        const renderer = getPreview()?.renderer;
        const programs = Array.isArray(renderer?.info?.programs) ? renderer.info.programs : [];
        const inventory = new Map();
        programs.forEach((program, index) => {
            const cacheKey = String(program?.cacheKey ?? `program_id:${program?.id ?? index}`);
            inventory.set(cacheKey, {
                id: program?.id ?? null,
                name: String(program?.name || 'unknown'),
                kind: classifyRendererProgram(program),
                usedTimes: program?.usedTimes ?? null,
                cacheKeyHash: hashDiagnosticString(cacheKey),
                cacheKeyLength: cacheKey.length,
                cacheKeyHead: cacheKey.slice(0, 240).replace(/\s+/g, ' ')
            });
        });
        return inventory;
    }

    function summarizeRendererProgramDelta(before, after) {
        const added = Array.from(after.entries())
            .filter(([cacheKey]) => !before.has(cacheKey))
            .map(([, program]) => program);
        const countBy = field => added.reduce((counts, program) => {
            const key = program[field] || 'unknown';
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        }, {});
        return {
            before: before.size,
            after: after.size,
            added: added.length,
            byKind: countBy('kind'),
            byName: countBy('name'),
            programs: added.slice(0, 64)
        };
    }

    function getLightSnapshot() {
        const preview = getPreview();
        const renderer = preview?.renderer;
        const limits = root.LightflowRenderer?.getCapabilities?.(renderer) || null;
        const list = Array.isArray(root.LightElement?.all) ? root.LightElement.all : [];
        return list.map((element, index) => {
            const light = safe(() => root.three_lights?.[element.uuid], null) || element?.mesh || element?.preview_controller?.mesh || null;
            const shadow = light?.shadow || null;
            const logicalWidth = Number(shadow?.mapSize?.width) || 0;
            const logicalHeight = Number(shadow?.mapSize?.height) || 0;
            const point = !!(light?.isPointLight || shadow?.isPointLightShadow || element?.light_type === 'point');
            const atlas = point ? [4, 2] : [1, 1];
            const expected = [logicalWidth * atlas[0], logicalHeight * atlas[1]];
            return {
                index,
                uuid: element?.uuid || light?.uuid || null,
                name: element?.name || light?.name || null,
                lightType: element?.light_type || light?.type || null,
                hasShadow: element?.has_shadow !== false,
                logical: [logicalWidth, logicalHeight],
                expectedPhysical: expected,
                actualPhysical: shadow?.map ? [shadow.map.width || 0, shadow.map.height || 0] : null,
                legal: !limits || (expected[0] <= limits.legalWidth && expected[1] <= limits.legalHeight),
                needsUpdate: !!shadow?.needsUpdate
            };
        });
    }

    function getDiagnostics() {
        return toSerializable(safe(() => root.LightflowDiagnostics?.snapshot?.(), null));
    }

    function getWarmupCompilerTelemetry() {
        const warmup = safe(() => root.LightflowDiagnostics?.snapshot?.()?.shaderWarmup, null);
        if (!warmup) return null;
        const selectUnit = unit => ({
            index: unit?.index ?? null,
            type: unit?.type || null,
            label: unit?.label || null,
            familyKey: String(unit?.familyKey || '').slice(0, 2000) || null,
            familySize: unit?.familySize ?? null,
            materialType: unit?.materialType || null,
            materialName: unit?.materialName || null,
            shaderId: unit?.shaderId || null,
            vertexLength: unit?.vertexLength ?? null,
            fragmentLength: unit?.fragmentLength ?? null,
            durationMs: unit?.durationMs ?? null,
            programDelta: unit?.programDelta ?? null,
            programDeltaAttribution: unit?.programDeltaAttribution || null,
            success: unit?.success !== false
        });
        const taskTimingHistory = Array.isArray(warmup.taskTimingHistory)
            ? warmup.taskTimingHistory.map(task => ({
                cause: task?.cause || null,
                type: task?.type || null,
                renderMode: task?.renderMode || null,
                completed: task?.completed !== false,
                durationMs: task?.durationMs ?? null,
                programDelta: task?.programDelta ?? null,
                unitCount: task?.unitCount ?? null,
                programFamilyCount: task?.programFamilyCount ?? null,
                shadowUnitCount: task?.shadowUnitCount ?? null,
                concurrency: task?.concurrency ?? null,
                peakPendingPrograms: task?.peakPendingPrograms ?? null,
                schedulerWallMs: task?.schedulerWallMs ?? null,
                liveScenePrimeMs: task?.liveScenePrimeMs ?? null,
                liveScenePrimeProgramDelta: task?.liveScenePrimeProgramDelta ?? null,
                auxiliaryPrimeMs: task?.auxiliaryPrimeMs ?? null,
                auxiliaryPrimeProgramDelta: task?.auxiliaryPrimeProgramDelta ?? null,
                auxiliaryPrimeUnitCount: task?.auxiliaryPrimeUnitCount ?? null,
                auxiliaryPrimeProgramFamilyCount: task?.auxiliaryPrimeProgramFamilyCount ?? null,
                auxiliaryPrimeMaterialCount: task?.auxiliaryPrimeMaterialCount ?? null,
                auxiliaryPrimeCacheHit: task?.auxiliaryPrimeCacheHit === true,
                slowestUnits: (Array.isArray(task?.slowestUnits) ? task.slowestUnits : [])
                    .slice(0, 12)
                    .map(selectUnit)
            }))
            : [];
        return {
            sourceComplexityClass: warmup.sourceComplexityClass || null,
            feedback: toSerializable(warmup.feedback || null),
            maxSourceChars: warmup.maxSourceChars ?? null,
            maxFragmentChars: warmup.maxFragmentChars ?? null,
            worstSubmissionMs: warmup.worstSubmissionMs ?? null,
            worstFinalizeMs: warmup.worstFinalizeMs ?? null,
            lastSlowestUnits: (Array.isArray(warmup.lastSlowestUnits) ? warmup.lastSlowestUnits : [])
                .slice(0, 12)
                .map(selectUnit),
            taskTimingHistory
        };
    }

    function getProfilerSnapshot() {
        const preview = getPreview();
        return {
            profile: toSerializable(safe(() => root.LightflowFrameProfiler?.getProfile?.(preview), null)),
            statistics: toSerializable(safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null)),
            resources: toSerializable(safe(() => root.LightflowFrameProfiler?.getFrameResources?.(preview), null))
        };
    }

    function getArchitectureSnapshot() {
        return {
            graph: toSerializable(safe(() => root.LightflowRenderer?.describeGraph?.(), null)),
            renderer: getRendererSnapshot(),
            lights: getLightSnapshot(),
            diagnostics: getDiagnostics(),
            ambientOcclusion: {
                runtime: toSerializable(safe(() => (
                    root.LightflowAmbientOcclusion?.getDiagnostics?.()
                ), null)),
                architectureComparison: [
                    {
                        metric: 'ao_specific_lowres_draws_when_evaluated',
                        rc8: 8,
                        temporalGtaoLiteV2: 1
                    },
                    {
                        metric: 'ao_forced_fullres_normal_bytes_per_pixel',
                        rc8: 4,
                        temporalGtaoLiteV2: 0
                    },
                    {
                        metric: 'ao_depth_hierarchy_draws_common_path',
                        rc8: 4,
                        temporalGtaoLiteV2: 0
                    },
                    {
                        metric: 'ao_separate_fullres_composite_draws',
                        rc8: 1,
                        temporalGtaoLiteV2: 0
                    }
                ]
            },
            warmupCompilerTelemetry: getWarmupCompilerTelemetry(),
            profiler: getProfilerSnapshot(),
            frameBudget: toSerializable(safe(() => root.LightflowFrameBudget?.get?.(), null)),
            isolation: toSerializable(safe(() => root.LightflowPerformanceIsolation?.get?.(), null)),
            programCompilers: toSerializable(safe(() => (
                root.LightflowRenderer?.getProgramCompilerDiagnostics?.()
            ), null)),
            rendercraftCompiler: toSerializable(safe(() => root.LightflowRenderer?.inspectRendercraft?.(
                'cinematic_craft', {}, 'beauty'
            ), null)),
            rendercraftBloomCompiler: toSerializable(safe(() => root.LightflowRenderer?.inspectRendercraft?.(
                'cinematic_craft', {}, 'studio_bloom'
            ), null)),
            pbrCompiler: toSerializable(safe(() => root.LightflowRenderer?.inspectPbr?.(
                'pbr_metallic_roughness'
            ), null)),
            lightflowSurfaceCompiler: toSerializable(safe(() => (
                root.LightflowRenderer?.inspectLightflowSurface?.('shaded_lightflow')
            ), null)),
            ssrArchitecture: toSerializable(safe(() => root.LightflowRenderer?.ssrArchitecture, null)),
            studio: toSerializable(safe(() => root.LightflowStudioRenderDiagnostics, null)),
            studioResources: toSerializable(safe(() => root.StudioRender?.getResourceDiagnostics?.(), null)),
            environmentResources: toSerializable(safe(() => root.LightflowEnvironment?.getResourceDiagnostics?.(), null)),
            atmosphereResources: toSerializable(safe(() => root.LightflowAtmosphere?.getResourceDiagnostics?.(), null))
        };
    }

    function evaluateStudioPostQualityContract(diagnostics, expectations = {}) {
        const studio = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
        const ao = studio.ambientOcclusion && typeof studio.ambientOcclusion === 'object'
            ? studio.ambientOcclusion
            : {};
        const bloom = studio.bloomProfile && typeof studio.bloomProfile === 'object'
            ? studio.bloomProfile
            : {};
        const checks = [];
        const requireAo = expectations.requireAo !== false;
        const requireBloom = expectations.requireBloom !== false;
        const add = (id, expected, actual, passed) => {
            checks.push({ id, expected, actual, passed: passed === true });
        };
        add(
            'contract_version',
            'studio-post-max-v1',
            studio.postQualityContract || null,
            studio.postQualityContract === 'studio-post-max-v1'
        );
        if (requireAo && expectations.requestedAoQuality) {
            add(
                'ao_requested_quality_preserved',
                expectations.requestedAoQuality,
                ao.requestedQuality || null,
                ao.requestedQuality === expectations.requestedAoQuality
            );
        }
        if (requireAo) {
            add('ao_runtime_quality', 'studio', ao.quality || null, ao.quality === 'studio');
            add('ao_runtime_override', true, ao.studioForced === true, ao.studioForced === true);
            add('ao_scale', 1, Number(ao.scale), Math.abs(Number(ao.scale) - 1) < 0.0001);
            add('ao_effective_spp', 18, Number(ao.effectiveSPP), Number(ao.effectiveSPP) === 18);
            add('ao_hierarchy_levels', 0, Number(ao.hierarchyLevels), Number(ao.hierarchyLevels) === 0);
        }
        if (requireBloom && expectations.requestedBloomQuality) {
            add(
                'bloom_requested_quality_preserved',
                expectations.requestedBloomQuality,
                studio.bloomRequestedQuality || null,
                studio.bloomRequestedQuality === expectations.requestedBloomQuality
            );
        }
        if (requireBloom) {
            add(
                'bloom_runtime_quality',
                'studio_high',
                studio.bloomRuntimeQuality || null,
                studio.bloomRuntimeQuality === 'studio_high'
            );
            add(
                'bloom_runtime_override',
                true,
                studio.bloomQualityForced === true,
                studio.bloomQualityForced === true
            );
            add(
                'bloom_scale',
                2 / 3,
                Number(bloom.scale),
                Math.abs(Number(bloom.scale) - 2 / 3) < 0.0001
            );
            add('bloom_max_levels', 6, Number(bloom.maxLevels), Number(bloom.maxLevels) === 6);
            add(
                'bloom_downsample_kernel',
                'hq13_karis_first',
                bloom.downsampleKernel || null,
                bloom.downsampleKernel === 'hq13_karis_first'
            );
            add(
                'bloom_upsample_kernel',
                'tent9',
                bloom.upsampleKernel || null,
                bloom.upsampleKernel === 'tent9'
            );
            add(
                'bloom_pipeline_active',
                'mrt_or_cpu_fallback',
                studio.bloomSourceMode || 'disabled',
                studio.bloomSourceMode === 'mrt' || studio.bloomSourceMode === 'cpu_fallback'
            );
        }
        if (requireBloom && studio.bloomSourceMode === 'cpu_fallback') {
            const fallback = studio.bloomCpuFallbackProfile || {};
            add(
                'bloom_cpu_fallback_dimension',
                4096,
                Number(fallback.maxDimension),
                Number(fallback.maxDimension) === 4096
            );
            add(
                'bloom_cpu_fallback_pyramid',
                '2,4,8',
                Array.isArray(fallback.divisors) ? fallback.divisors.join(',') : null,
                Array.isArray(fallback.divisors) && fallback.divisors.join(',') === '2,4,8'
            );
        }
        return {
            version: 'studio-post-max-v1',
            passed: checks.every(check => check.passed),
            checks
        };
    }

    function drainWebGLErrors() {
        const preview = getPreview();
        if (!preview?.renderer) return [];
        return safe(() => root.LightflowRenderer?.drainErrors?.(preview.renderer), []) || [];
    }

    function getWebGLErrorName(error) {
        const gl = safe(() => getPreview()?.renderer?.getContext?.(), null);
        if (!gl) return `0x${Number(error).toString(16)}`;
        const names = [
            'INVALID_ENUM',
            'INVALID_VALUE',
            'INVALID_OPERATION',
            'INVALID_FRAMEBUFFER_OPERATION',
            'OUT_OF_MEMORY',
            'CONTEXT_LOST_WEBGL'
        ];
        return names.find(name => gl[name] === error) || `0x${Number(error).toString(16)}`;
    }

    function checkpointWebGLErrors(scenario, label, details = null) {
        if (!scenario) return [];
        const errors = drainWebGLErrors();
        if (!errors.length) return errors;
        (scenario.webglErrorCheckpoints ||= []).push({
            label: String(label || 'checkpoint'),
            at: wallIso(),
            errors: errors.slice(),
            names: errors.map(getWebGLErrorName),
            details: details ? toSerializable(details) : null
        });
        return errors;
    }

    class WebGLErrorMethodTracer {
        constructor(enabled = false) {
            this.enabled = enabled === true;
            this.gl = null;
            this.records = [];
            this.wrappers = [];
            this.maxRecords = 48;
        }
        summarizeArgument(value) {
            if (value === null) return null;
            if (value === undefined) return 'undefined';
            if (typeof value === 'number' || typeof value === 'boolean') return value;
            if (typeof value === 'string') return value.slice(0, 120);
            if (Array.isArray(value) || ArrayBuffer.isView(value)) {
                const items = Array.from(value);
                if (items.length <= 8 && items.every(item => (
                    typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string'
                ))) return items;
                return `${value.constructor?.name || 'Array'}(${value.length})`;
            }
            return value?.constructor?.name || typeof value;
        }
        captureState(nativeGetParameter, nativeCheckFramebufferStatus) {
            if (!this.gl || typeof nativeGetParameter !== 'function') return null;
            const gl = this.gl;
            const read = parameter => {
                try { return nativeGetParameter.call(gl, parameter); } catch (error) { return null; }
            };
            const maxDrawBuffers = Math.min(8, Math.max(1, Number(read(gl.MAX_DRAW_BUFFERS)) || 1));
            const drawBuffers = [];
            if (typeof gl.DRAW_BUFFER0 === 'number') {
                for (let index = 0; index < maxDrawBuffers; index++) {
                    drawBuffers.push(read(gl.DRAW_BUFFER0 + index));
                }
            }
            let framebufferStatus = null;
            if (typeof nativeCheckFramebufferStatus === 'function') {
                try { framebufferStatus = nativeCheckFramebufferStatus.call(gl, gl.FRAMEBUFFER); } catch (error) {}
            }
            return {
                framebuffer: this.summarizeArgument(read(gl.FRAMEBUFFER_BINDING)),
                framebufferStatus,
                framebufferComplete: framebufferStatus === gl.FRAMEBUFFER_COMPLETE,
                program: this.summarizeArgument(read(gl.CURRENT_PROGRAM)),
                drawBuffers
            };
        }
        record(method, phase, errors, args, state = null) {
            if (!errors.length || this.records.length >= this.maxRecords) return;
            this.records.push({
                at: wallIso(),
                method,
                phase,
                errors: errors.slice(),
                names: errors.map(getWebGLErrorName),
                arguments: args.slice(0, 8).map(value => this.summarizeArgument(value)),
                state,
                stack: String(new Error().stack || '').split('\n').slice(2, 10)
            });
        }
        drain(nativeGetError) {
            if (!this.gl || typeof nativeGetError !== 'function') return [];
            const errors = [];
            const noError = this.gl.NO_ERROR ?? 0;
            for (let index = 0; index < 8; index++) {
                const error = nativeGetError.call(this.gl);
                if (error === noError) break;
                errors.push(error);
            }
            return errors;
        }
        start() {
            if (!this.enabled) return false;
            const gl = safe(() => getPreview()?.renderer?.getContext?.(), null);
            if (!gl || typeof gl.getError !== 'function') return false;
            this.gl = gl;
            const nativeGetError = gl.getError;
            const nativeGetParameter = gl.getParameter;
            const nativeCheckFramebufferStatus = gl.checkFramebufferStatus;
            const methods = [
                'drawBuffers', 'getParameter',
                'bindFramebuffer', 'framebufferTexture2D', 'framebufferTextureLayer',
                'checkFramebufferStatus', 'readBuffer', 'blitFramebuffer',
                'createQuery', 'beginQuery', 'endQuery', 'getQueryParameter', 'deleteQuery',
                'enable', 'disable', 'colorMask', 'depthMask', 'depthFunc',
                'stencilMask', 'stencilFunc', 'stencilOp', 'cullFace', 'frontFace',
                'blendEquation', 'blendEquationSeparate', 'blendFunc', 'blendFuncSeparate',
                'polygonOffset', 'lineWidth', 'scissor', 'viewport',
                'activeTexture', 'bindTexture', 'bindBuffer', 'bindVertexArray',
                'texImage2D', 'texSubImage2D', 'generateMipmap',
                'vertexAttribPointer', 'vertexAttribIPointer', 'enableVertexAttribArray',
                'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
                'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
                'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
                'uniform1iv', 'uniform2iv', 'uniform3iv', 'uniform4iv',
                'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
                'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
                'isProgram', 'getProgramParameter', 'getAttachedShaders',
                'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
                'getActiveUniform', 'getActiveAttrib', 'getUniformLocation',
                'useProgram', 'linkProgram', 'validateProgram'
            ];
            methods.forEach(method => {
                const original = gl[method];
                if (typeof original !== 'function') return;
                const tracer = this;
                const wrapper = function lightflowWebGLErrorMethodTrace(...args) {
                    const before = tracer.drain(nativeGetError);
                    tracer.record(
                        method,
                        'before',
                        before,
                        args,
                        before.length ? tracer.captureState(nativeGetParameter, nativeCheckFramebufferStatus) : null
                    );
                    const result = original.apply(this, args);
                    const after = tracer.drain(nativeGetError);
                    tracer.record(
                        method,
                        'after',
                        after,
                        args,
                        after.length ? tracer.captureState(nativeGetParameter, nativeCheckFramebufferStatus) : null
                    );
                    return result;
                };
                try {
                    gl[method] = wrapper;
                    if (gl[method] === wrapper) this.wrappers.push({ method, original, wrapper });
                } catch (error) {}
            });
            return this.wrappers.length > 0;
        }
        stop() {
            if (this.gl) {
                this.wrappers.slice().reverse().forEach(({ method, original, wrapper }) => {
                    try {
                        if (this.gl[method] === wrapper) this.gl[method] = original;
                    } catch (error) {}
                });
            }
            const result = {
                enabled: this.enabled,
                installedMethods: this.wrappers.map(record => record.method),
                records: this.records.slice()
            };
            this.wrappers = [];
            this.gl = null;
            return result;
        }
    }

    function getWarmupState() {
        const diagnostics = getDiagnostics();
        const warmup = diagnostics?.shaderWarmup || null;
        return {
            state: warmup?.state || 'UNKNOWN',
            queue: warmup?.queue ?? warmup?.queueLength ?? diagnostics?.performance?.warmupQueue ?? null,
            pendingPrograms: warmup?.pendingPrograms ?? null,
            activeJobs: warmup?.activeJobs ?? null,
            failed: diagnostics?.performance?.warmupFailed ?? warmup?.failed ?? null,
            programs: diagnostics?.renderer?.programs ?? getRendererSnapshot()?.programs ?? null,
            warmup
        };
    }

    async function waitForWarmupStable(config, recordMilestone) {
        const timeoutMs = Math.max(1000, Number(config.warmupTimeoutMs) || DEFAULT_CONFIG.warmupTimeoutMs);
        const stableMs = Math.max(200, Number(config.warmupStableMs) || DEFAULT_CONFIG.warmupStableMs);
        const started = now();
        const initialState = getWarmupState();
        const initialFailed = Number.isFinite(Number(initialState.failed))
            ? Number(initialState.failed)
            : 0;
        let stableSince = null;
        let lastPrograms = null;
        let lastState = null;
        let lastRecordAt = 0;
        let lastPollAt = started;
        let maxPollGapMs = 0;
        while (now() - started < timeoutMs) {
            if (activeRunner?.cancelled && !activeRunner.restoring) throw new Error('Lightflow Test Lab run cancelled.');
            const polledAt = now();
            maxPollGapMs = Math.max(maxPollGapMs, polledAt - lastPollAt);
            lastPollAt = polledAt;
            const state = getWarmupState();
            const elapsed = polledAt - started;
            const programs = state.programs;
            const changed = state.state !== lastState || programs !== lastPrograms;
            if (changed || elapsed - lastRecordAt > 1000) {
                recordMilestone?.({ atMs: round(elapsed), ...toSerializable(state) });
                lastRecordAt = elapsed;
                lastState = state.state;
                lastPrograms = programs;
            }
            const failedCount = Number.isFinite(Number(state.failed)) ? Number(state.failed) : initialFailed;
            const failedDelta = Math.max(0, failedCount - initialFailed);
            if (failedDelta > 0 || state.state === 'DEGRADED' || state.state === 'FAILED') {
                return {
                    ok: false,
                    timedOut: false,
                    failed: true,
                    reason: 'warmup_failed',
                    failedDelta,
                    durationMs: round(now() - started),
                    state
                };
            }
            if (state.state === 'READY') {
                if (stableSince === null || changed) stableSince = now();
                if (now() - stableSince >= stableMs) {
                    return { ok: true, timedOut: false, durationMs: round(now() - started), state };
                }
            } else {
                stableSince = null;
            }
            await nextFrame();
        }
        const ended = now();
        maxPollGapMs = Math.max(maxPollGapMs, ended - lastPollAt);
        const durationMs = round(ended - started);
        const finalState = getWarmupState();
        // A synchronous driver/compiler stall can prevent this loop from
        // observing READY until after its deadline. Report that separately from
        // a warm-up that is genuinely still pending, and keep it as a failure:
        // a minute-long main-thread freeze is not realtime-ready.
        if (finalState.state === 'READY' && maxPollGapMs >= Math.max(1000, stableMs * 2)) {
            return {
                ok: false,
                timedOut: false,
                stalled: true,
                failed: false,
                reason: 'scheduler_blocked_past_deadline',
                durationMs,
                deadlineOverrunMs: round(Math.max(0, durationMs - timeoutMs)),
                maxPollGapMs: round(maxPollGapMs),
                state: finalState
            };
        }
        return {
            ok: false,
            timedOut: true,
            stalled: false,
            durationMs,
            maxPollGapMs: round(maxPollGapMs),
            state: finalState
        };
    }

    class FrameSampler {
        constructor(durationMs) {
            this.durationMs = Math.max(100, Number(durationMs) || 1000);
            this.deltas = [];
            this.timestamps = [];
            this.startedAt = 0;
            this.endedAt = 0;
            this.running = false;
            FrameSampler.active.add(this);
        }
        async run(onFrame = null) {
            this.running = true;
            this.startedAt = now();
            let previous = null;
            let frameIndex = 0;
            try {
                while (this.running && now() - this.startedAt < this.durationMs) {
                    const timestamp = await nextFrame();
                    if (!this.running || (activeRunner?.cancelled && !activeRunner.restoring)) break;
                    const current = Number(timestamp) || now();
                    if (previous !== null) {
                        this.deltas.push(Math.max(0, current - previous));
                        this.timestamps.push(current - this.startedAt);
                    }
                    previous = current;
                    if (onFrame) await onFrame(frameIndex++, current, current - this.startedAt);
                }
            } finally {
                this.endedAt = now();
                this.running = false;
                FrameSampler.active.delete(this);
            }
            return summarizeFrameDeltas(this.deltas, this.endedAt - this.startedAt);
        }
        stop() { this.running = false; }
        static stopAll() { FrameSampler.active.forEach(sampler => sampler.stop()); }
    }
    FrameSampler.active = new Set();

    class LongTaskCapture {
        constructor(enabled, origin = 0) {
            this.enabled = !!enabled;
            this.origin = origin;
            this.entries = [];
            this.observer = null;
            this.supported = false;
        }
        start() {
            if (!this.enabled || typeof PerformanceObserver === 'undefined') return false;
            if (Array.isArray(PerformanceObserver.supportedEntryTypes) && !PerformanceObserver.supportedEntryTypes.includes('longtask')) return false;
            try {
                const observationStartedAt = now();
                this.collect = entries => {
                    entries.forEach(entry => {
                        // Delivery can lag behind the task itself. A task that
                        // started before this observer belongs to the previous
                        // phase, not to the scenario currently receiving it.
                        if (entry.startTime < observationStartedAt) return;
                        this.entries.push({
                            startTime: round(entry.startTime),
                            atMs: round(entry.startTime - this.origin),
                            duration: round(entry.duration),
                            name: entry.name || 'longtask'
                        });
                    });
                };
                this.observer = new PerformanceObserver(list => this.collect(list.getEntries()));
                this.observer.observe({ entryTypes: ['longtask'] });
                this.supported = true;
                return true;
            } catch (error) {
                this.observer = null;
                return false;
            }
        }
        stop() {
            try { this.collect?.(this.observer?.takeRecords?.() || []); } catch (error) {}
            try { this.observer?.disconnect?.(); } catch (error) {}
            this.observer = null;
        }
        summary() {
            const durations = this.entries.map(entry => entry.duration).filter(Number.isFinite);
            return {
                supported: this.supported,
                count: durations.length,
                totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
                worstMs: durations.length ? round(Math.max(...durations)) : 0,
                entries: this.entries.slice()
            };
        }
    }

    function getCompilationResponsivenessFailure(scenario, samples = []) {
        const worstLongTaskMs = Number(scenario.longTasks?.worstMs) || 0;
        const worstVisibleFrameMs = samples.reduce((worst, sample) => (
            sample.scenarioId === scenario.id && sample.visibilityState === 'visible'
                ? Math.max(worst, Number(sample.deltaMs) || 0) : worst
        ), 0);
        return Math.max(worstLongTaskMs, worstVisibleFrameMs) >= 1000
            ? { type: 'compilation_responsiveness_failure', worstLongTaskMs, worstVisibleFrameMs, limitMs: 1000 }
            : null;
    }

    class ShaderCompilationCapture {
        constructor(report, context = () => ({})) {
            this.report = report;
            this.context = context;
            this.wrappers = [];
            this.active = false;
        }
        start(renderer) {
            const gl = renderer?.getContext?.();
            if (!gl || this.active) return false;
            this.active = true;
            const data = this.report.shaderCompilation = { scope: 'selected_preview_webgl_context', methods: {}, slowCalls: [], sources: [], programs: [], droppedPrograms: 0, droppedSlowCalls: 0 };
            const sourceByShader = new WeakMap();
            const sourcesByProgram = new WeakMap();
            const pendingLinks = new WeakMap();
            const methods = ['shaderSource', 'compileShader', 'attachShader', 'linkProgram',
                'getProgramParameter', 'getShaderParameter', 'getActiveUniform', 'getActiveAttrib',
                'getUniformLocation', 'getAttribLocation', 'useProgram', 'drawElements', 'drawArrays',
                'drawElementsInstanced', 'drawArraysInstanced',
                // These existing queries/transfers may wait for queued GPU work.
                // Only time calls made by the app; never introduce a flush/query.
                'getError', 'getParameter', 'checkFramebufferStatus', 'readPixels',
                'getProgramInfoLog', 'getShaderInfoLog', 'finish', 'flush',
                'texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData'];
            methods.forEach(name => {
                const original = gl[name];
                if (typeof original !== 'function') return;
                const capture = this;
                const wrapped = function (...args) {
                    if (!capture.active) return original.apply(this, args);
                    if (name === 'shaderSource' && args[0] && typeof args[1] === 'string') {
                        let hash = 2166136261;
                        for (let i = 0; i < args[1].length; i++) hash = Math.imul(hash ^ args[1].charCodeAt(i), 16777619);
                        const source = { hash: (hash >>> 0).toString(36), chars: args[1].length };
                        sourceByShader.set(args[0], source);
                        if (!data.sources.some(item => item.hash === source.hash)) data.sources.push(source);
                    }
                    if (name === 'attachShader' && args[0] && args[1]) {
                        const sources = sourcesByProgram.get(args[0]) || [];
                        sources.push(sourceByShader.get(args[1]) || null);
                        sourcesByProgram.set(args[0], sources);
                    }
                    const started = now();
                    if (name === 'linkProgram') pendingLinks.set(args[0], { started, context: capture.context() });
                    let result;
                    try { result = original.apply(this, args); return result; }
                    finally {
                        // KHR completion is asynchronous: cheap API calls can hide
                        // a minute of driver work between link and readiness.
                        if (name === 'getProgramParameter' && args[1] === 0x91B1 && result === true) {
                            const pending = pendingLinks.get(args[0]);
                            if (pending) {
                                if (data.programs.length < 512) data.programs.push({
                                    durationMs: round(now() - pending.started), ...pending.context,
                                    sources: sourcesByProgram.get(args[0]) || [],
                                    completion: capture.context()
                                });
                                else data.droppedPrograms++;
                                pendingLinks.delete(args[0]);
                            }
                        }
                        const durationMs = Math.max(0, now() - started);
                        const stats = data.methods[name] ||= { calls: 0, totalMs: 0, worstMs: 0 };
                        stats.calls++;
                        stats.totalMs += durationMs;
                        stats.worstMs = Math.max(stats.worstMs, durationMs);
                        if (durationMs >= 8) {
                            if (data.slowCalls.length < 256) data.slowCalls.push({
                                method: name, durationMs: round(durationMs), ...capture.context(),
                                sources: sourceByShader.get(args[0]) || sourcesByProgram.get(args[0]) || null,
                                parameter: name.endsWith('Parameter') ? args[1] : null,
                                stack: String(new Error().stack || '').split('\n').slice(2, 9).join('\n')
                            });
                            else data.droppedSlowCalls++;
                        }
                    }
                };
                try {
                    gl[name] = wrapped;
                    if (gl[name] === wrapped) this.wrappers.push({ gl, name, original, wrapped });
                } catch (error) { /* Some hosts expose non-writable GL methods. */ }
            });
            return true;
        }
        stop() {
            this.active = false;
            this.wrappers.reverse().forEach(({ gl, name, original, wrapped }) => {
                if (gl[name] === wrapped) gl[name] = original;
            });
            this.wrappers = [];
        }
    }

    class RuntimeCapture {
        constructor(config, report) {
            this.config = config;
            this.report = report;
            this.consoleOriginals = null;
            this.listeners = [];
            this.blockbenchListeners = [];
            this.runtimeErrorIndex = new Map();
            this.runtimeErrorOccurrences = 0;
            this.startedAt = now();
        }
        start() {
            if (this.config.captureConsole) this.installConsoleCapture();
            this.installGlobalErrors();
            this.installContextListeners();
            if (this.config.captureEvents) this.installBlockbenchEvents();
            if (this.config.traceWorkflowOperations) this.installWorkflowOperationCapture();
            if (['performance_diagnostics', 'shader_compilation'].includes(this.config.suite) && typeof requestAnimationFrame === 'function') {
                this.pacingRunning = true;
                this.phase = 'project_setup';
                this.report.sessionPacing = { source: 'continuous_session_raf', samples: [] };
                let previous = now();
                const observe = async () => {
                    while (this.pacingRunning) {
                        const phase = this.phase;
                        const scenarioId = this.scenarioId || null;
                        await nextFrame();
                        if (!this.pacingRunning) break;
                        const current = now();
                        this.report.sessionPacing.samples.push({ atMs: round(current - this.startedAt),
                            deltaMs: round(current - previous), scenarioId, phase,
                            visibilityState: root.document?.visibilityState || null });
                        previous = current;
                    }
                };
                this.pacingPromise = observe();
            }
            if (this.config.traceShaderCompilation) {
                this.shaderCapture = new ShaderCompilationCapture(this.report, () => ({
                    atMs: round(now() - this.startedAt), scenarioId: this.scenarioId || null,
                    warmupCause: root.ShaderEngine?.shaderWarmupCurrentTask?.cause || null,
                    warmupType: root.ShaderEngine?.shaderWarmupCurrentTask?.type || null
                }));
                this.shaderCapture.start(getPreview()?.renderer);
            }
        }
        installWorkflowOperationCapture() {
            this.operationRestorers = [];
            const trace = this.report.workflowOperations = { measurement: 'synchronous_inclusive_cpu', totals: {}, slowCalls: [] };
            const capture = this;
            const wrap = (owner, name, label) => {
                const original = owner?.[name];
                if (typeof original !== 'function') return;
                const hadOwn = Object.prototype.hasOwnProperty.call(owner, name);
                const totals = trace.totals[label] = { calls: 0, totalMs: 0, maxMs: 0 };
                const wrapper = function (...args) {
                    const start = now();
                    try { return original.apply(this, args); }
                    finally {
                        const duration = now() - start;
                        totals.calls++;
                        totals.totalMs += duration;
                        totals.maxMs = Math.max(totals.maxMs, duration);
                        if (duration >= 16 && trace.slowCalls.length < 300) {
                            // updateCubes receives (elements, cause, options),
                            // while the global update methods receive cause first.
                            // Recording only args[0] erased the reason for every
                            // expensive partial edit in manual workflow reports.
                            const causeArgument = label === 'ShaderEngine.updateCubes'
                                ? args[1]
                                : args[0];
                            const elementArgument = label === 'ShaderEngine.updateCubes'
                                ? args[0]
                                : null;
                            trace.slowCalls.push({
                                operation: label, atMs: round(start - capture.startedAt), durationMs: round(duration),
                                scenarioId: capture.scenarioId || null,
                                cause: typeof causeArgument === 'string' ? causeArgument.slice(0, 160) : null,
                                elementCount: Array.isArray(elementArgument) ? elementArgument.length : null
                            });
                        }
                    }
                };
                try { owner[name] = wrapper; } catch (error) { return; }
                if (owner[name] !== wrapper) return;
                this.operationRestorers.push(() => {
                    if (owner[name] !== wrapper) return;
                    if (hadOwn) owner[name] = original;
                    else delete owner[name];
                });
            };
            ['updateAllUniforms', 'updateAllCubes', 'updateCubes', 'applyToMesh', 'rebuildRenderBatches', 'requestGlobalRenderModeChange',
                'applyWorldShadingSetting', 'compileRendererSceneCooperatively'].forEach(name => wrap(root.ShaderEngine, name, `ShaderEngine.${name}`));
            ['updateAllFaces', 'updateView', 'updateShading', 'updateLayeredTextures'].forEach(name => wrap(root.Canvas, name, `Canvas.${name}`));
            wrap(root.LightflowEnvironment, 'setSettings', 'Environment.setSettings');
            wrap(root.Codecs?.project, 'compile', 'Project.compile');
            Object.entries(root.Modes?.options || {}).forEach(([id, mode]) => wrap(mode, 'select', `Mode.${id}.select`));
        }
        installConsoleCapture() {
            if (!root.console || this.consoleOriginals) return;
            this.consoleOriginals = {};
            ['warn', 'error'].forEach(level => {
                const original = root.console[level]?.bind(root.console);
                if (!original) return;
                this.consoleOriginals[level] = original;
                root.console[level] = (...args) => {
                    if (this.report.console.length < this.config.maxConsoleEntries) {
                        this.report.console.push({
                            atMs: round(now() - this.startedAt),
                            level,
                            text: args.map(arg => {
                                if (typeof arg === 'string') return arg;
                                if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
                                try { return JSON.stringify(toSerializable(arg)); }
                                catch (error) { return String(arg); }
                            }).join(' ')
                        });
                    }
                    original(...args);
                };
            });
        }
        installGlobalErrors() {
            if (!root.addEventListener) return;
            const record = entry => {
                this.runtimeErrorOccurrences += 1;
                const firstStackLine = String(entry.stack || '').split('\n')[0] || '';
                const signature = `${entry.type}|${entry.message}|${firstStackLine}`;
                const existing = this.runtimeErrorIndex.get(signature);
                if (existing) {
                    existing.count = (existing.count || 1) + 1;
                    existing.lastAtMs = entry.atMs;
                    return;
                }
                entry.count = 1;
                entry.lastAtMs = entry.atMs;
                this.runtimeErrorIndex.set(signature, entry);
                this.report.runtimeErrors.push(entry);
            };
            const onError = event => {
                record({
                    atMs: round(now() - this.startedAt),
                    type: 'error',
                    message: event?.message || String(event?.error || 'Unknown error'),
                    stack: event?.error?.stack || null
                });
            };
            const onRejection = event => {
                const reason = event?.reason;
                record({
                    atMs: round(now() - this.startedAt),
                    type: 'unhandledrejection',
                    message: reason?.message || String(reason || 'Unknown rejection'),
                    stack: reason?.stack || null
                });
            };
            root.addEventListener('error', onError);
            root.addEventListener('unhandledrejection', onRejection);
            this.listeners.push(['error', onError], ['unhandledrejection', onRejection]);
        }
        installContextListeners() {
            const previews = root.Preview?.all || [];
            const boundCanvases = new Set();
            previews.forEach(preview => {
                const canvas = preview?.renderer?.domElement;
                if (!canvas?.addEventListener || boundCanvases.has(canvas)) return;
                boundCanvases.add(canvas);
                const onLost = event => {
                    if (preview?.sa_studio_intentional_context_retire) {
                        this.report.contextEvents.push({
                            atMs: round(now() - this.startedAt),
                            type: 'retired',
                            owner: 'studio_render'
                        });
                        return;
                    }
                    this.report.contextEvents.push({
                        atMs: round(now() - this.startedAt),
                        type: 'lost',
                        statusMessage: event?.statusMessage || null
                    });
                };
                const onRestored = () => this.report.contextEvents.push({ atMs: round(now() - this.startedAt), type: 'restored' });
                canvas.addEventListener('webglcontextlost', onLost, false);
                canvas.addEventListener('webglcontextrestored', onRestored, false);
                this.listeners.push(['__canvas_lost__', onLost, canvas], ['__canvas_restored__', onRestored, canvas]);
            });
        }
        installBlockbenchEvents() {
            if (!root.Blockbench?.on) return;
            WATCHED_BLOCKBENCH_EVENTS.forEach(name => {
                const ref = root.Blockbench.on(name, event => {
                    if (this.report.events.length >= this.config.maxEventEntries) return;
                    this.report.events.push({
                        atMs: round(now() - this.startedAt),
                        name,
                        detail: summarizeEventDetail(event)
                    });
                });
                this.blockbenchListeners.push(ref);
            });
        }
        stop() {
            this.pacingRunning = false;
            this.shaderCapture?.stop();
            this.operationRestorers?.reverse().forEach(restore => restore());
            this.operationRestorers = [];
            if (this.consoleOriginals) {
                Object.entries(this.consoleOriginals).forEach(([level, original]) => {
                    root.console[level] = original;
                });
                this.consoleOriginals = null;
            }
            this.listeners.forEach(([type, fn, canvas]) => {
                try {
                    if (type === '__canvas_lost__') canvas.removeEventListener('webglcontextlost', fn, false);
                    else if (type === '__canvas_restored__') canvas.removeEventListener('webglcontextrestored', fn, false);
                    else root.removeEventListener(type, fn);
                } catch (error) {}
            });
            this.listeners = [];
            this.blockbenchListeners.forEach(ref => {
                try { ref?.delete?.(); } catch (error) {}
            });
            this.blockbenchListeners = [];
        }
    }

    function summarizeEventDetail(event) {
        if (!event || typeof event !== 'object') return toSerializable(event);
        return {
            action: event.action || null,
            mode: event.mode?.id || event.mode || null,
            project: event.project?.name || event.project?.uuid || null,
            elements: Array.isArray(event.elements)
                ? event.elements.slice(0, 20).map(element => element?.uuid || element?.name || element?.type || null)
                : null,
            tile: event.tile ? {
                index: event.tile.index ?? null,
                renderWidth: event.tile.renderWidth ?? null,
                renderHeight: event.tile.renderHeight ?? null
            } : null
        };
    }

    function getMode() {
        return root.ShaderEngine?.globalRenderMode || null;
    }

    async function switchMode(modeId, config, scenario) {
        if (!MODE_IDS.includes(modeId)) return { ok: false, reason: 'unknown_mode' };
        if (!root.ShaderEngine?.requestGlobalRenderModeChange) return { ok: false, reason: 'api_unavailable' };
        const before = getMode();
        const started = now();
        const requested = root.ShaderEngine.requestGlobalRenderModeChange(modeId);
        if (!requested && getMode() !== modeId) {
            return { ok: false, reason: 'request_rejected', before, after: getMode() };
        }
        const milestones = [];
        const warmup = await waitForWarmupStable(config, item => milestones.push(item));
        const deadline = now() + 3500;
        while (getMode() !== modeId && now() < deadline) await nextFrame();
        const result = {
            ok: getMode() === modeId && warmup.ok,
            modeCommitted: getMode() === modeId,
            before,
            after: getMode(),
            requested,
            transitionMs: round(now() - started),
            warmup,
            milestones
        };
        if (scenario) {
            scenario.modeTransition = result;
            if (warmup.timedOut) {
                scenario.status = 'failed';
                scenario.errors.push({ type: 'warmup_timeout', mode: modeId, durationMs: warmup.durationMs });
            }
            if (getMode() !== modeId) {
                scenario.status = 'failed';
                scenario.errors.push({ type: 'mode_transition_failed', requested: modeId, actual: getMode() });
            }
        }
        return result;
    }

    function snapshotOverrideState() {
        const elements = getShaderElements();
        return elements.map(element => {
            const values = {};
            MATERIAL_OVERRIDE_FIELDS.forEach(field => {
                values[field] = Object.prototype.hasOwnProperty.call(element, field)
                    ? cloneJson(element[field], element[field])
                    : { __lightflowAbsent: true };
            });
            return { element, values };
        });
    }

    function getShaderElements() {
        const all = [];
        if (Array.isArray(root.Cube?.all)) all.push(...root.Cube.all);
        if (Array.isArray(root.Mesh?.all)) all.push(...root.Mesh.all);
        return Array.from(new Set(all.filter(Boolean)));
    }

    function clearOverrides(snapshot) {
        (snapshot || []).forEach(record => {
            MATERIAL_OVERRIDE_FIELDS.forEach(field => {
                try { delete record.element[field]; } catch (error) { record.element[field] = undefined; }
            });
        });
        root.ShaderEngine?.updateAllCubes?.('test_lab_clear_overrides', { scheduleWarmup: false });
    }

    function restoreOverrides(snapshot) {
        (snapshot || []).forEach(record => {
            MATERIAL_OVERRIDE_FIELDS.forEach(field => {
                const value = record.values[field];
                if (value && value.__lightflowAbsent === true) {
                    try { delete record.element[field]; } catch (error) { record.element[field] = undefined; }
                } else {
                    record.element[field] = cloneJson(value, value);
                }
            });
        });
        root.ShaderEngine?.updateAllCubes?.('test_lab_restore_overrides', { scheduleWarmup: false });
    }

    function captureCubeState(cube) {
        return {
            from: cube.from?.slice?.() || null,
            to: cube.to?.slice?.() || null,
            origin: cube.origin?.slice?.() || null,
            rotation: cube.rotation?.slice?.() || null,
            inflate: cube.inflate,
            saved: root.Project?.saved
        };
    }

    function restoreCubeState(cube, state) {
        if (!cube || !state) return;
        if (state.from) cube.from.replace ? cube.from.replace(state.from) : cube.from = state.from.slice();
        if (state.to) cube.to.replace ? cube.to.replace(state.to) : cube.to = state.to.slice();
        if (state.origin) cube.origin.replace ? cube.origin.replace(state.origin) : cube.origin = state.origin.slice();
        if (state.rotation) cube.rotation.replace ? cube.rotation.replace(state.rotation) : cube.rotation = state.rotation.slice();
        if (state.inflate !== undefined) cube.inflate = state.inflate;
        updateElementTransform(cube, 'restore');
        if (root.Project && typeof state.saved === 'boolean') root.Project.saved = state.saved;
    }

    function updateElementTransform(element, action = 'move') {
        const updatedThroughCanvas = safe(() => {
            if (!root.Canvas?.updateView) return false;
            root.Canvas.updateView({
                elements: [element],
                element_aspects: { transform: true }
            });
            return true;
        }, false);
        if (!updatedThroughCanvas) {
            safe(() => element?.preview_controller?.updateTransform?.(element), null);
        }
        safe(() => root.Blockbench?.dispatchEvent?.('update_transform', {
            elements: [element],
            action,
            source: 'lightflow_test_lab'
        }), null);
        safe(() => root.LightflowAnimationRuntime?.markPlanDirty?.(), null);
        // Observe the same host render loop as a native edit. The transform
        // event already notifies Lightflow; a synchronous draw here added a
        // second full frame to every sample (and a third from the queued edit).
    }

    function captureCameraState(preview) {
        return {
            position: preview?.camera?.position?.clone?.(),
            quaternion: preview?.camera?.quaternion?.clone?.(),
            up: preview?.camera?.up?.clone?.(),
            target: preview?.controls?.target?.clone?.(),
            zoom: preview?.camera?.zoom,
            fov: preview?.camera?.fov
        };
    }

    function restoreCameraState(preview, state) {
        if (!preview || !state) return;
        if (state.position && preview.camera?.position) preview.camera.position.copy(state.position);
        if (state.quaternion && preview.camera?.quaternion) preview.camera.quaternion.copy(state.quaternion);
        if (state.up && preview.camera?.up) preview.camera.up.copy(state.up);
        if (state.target && preview.controls?.target) preview.controls.target.copy(state.target);
        if (Number.isFinite(state.zoom)) preview.camera.zoom = state.zoom;
        if (Number.isFinite(state.fov) && 'fov' in preview.camera) preview.camera.fov = state.fov;
        preview.camera?.updateProjectionMatrix?.();
        preview.controls?.update?.();
        preview.render?.();
    }

    function captureLightState() {
        const list = Array.isArray(root.LightElement?.all) ? root.LightElement.all : [];
        return list.map(element => ({
            element,
            has_shadow: element.has_shadow,
            position: element.position?.slice?.() || null,
            rotation: element.rotation?.slice?.() || null,
            saved: root.Project?.saved
        }));
    }

    function notifyLightsChanged(elements, options = {}) {
        const changed = (elements || []).filter(Boolean);
        safe(() => root.update_light_element_callback?.({
            elements: changed,
            cleanup: false,
            shadows: options.shadows !== false,
            scene: options.scene !== false,
            gizmos: options.gizmos === true
        }), null);
        changed.forEach(element => safe(() => element?.preview_controller?.updateTransform?.(element), null));
        safe(() => root.LightManagerPrepareRender?.(getPreview(), { studio: false }), null);
        safe(() => getPreview()?.render?.(), null);
    }

    function restoreLightState(snapshot) {
        (snapshot || []).forEach(record => {
            const element = record.element;
            element.has_shadow = record.has_shadow;
            if (record.position && element.position) element.position.replace ? element.position.replace(record.position) : element.position = record.position.slice();
            if (record.rotation && element.rotation) element.rotation.replace ? element.rotation.replace(record.rotation) : element.rotation = record.rotation.slice();
        });
        notifyLightsChanged((snapshot || []).map(record => record.element), { shadows: true, scene: true });
        if (root.Project && snapshot?.length && typeof snapshot[0].saved === 'boolean') root.Project.saved = snapshot[0].saved;
    }

    class StateTransaction {
        constructor(config) {
            this.config = config;
            this.project = root.Project || null;
            this.restorers = [];
            this.projectSaved = root.Project?.saved;
            this.profilerMode = safe(() => root.LightflowFrameProfiler?.getMode?.(), null);
            this.frameBudget = toSerializable(safe(() => root.LightflowFrameBudget?.get?.(), null));
            this.passOverrides = toSerializable(safe(() => root.LightflowPerformanceIsolation?.get?.(), {})) || {};
            this.originalMode = getMode();
        }
        push(restorer) {
            if (typeof restorer === 'function') this.restorers.push(restorer);
        }
        prepare() {
            if (this.config.profilerMode && root.LightflowFrameProfiler?.setMode) {
                root.LightflowFrameProfiler.setMode(this.config.profilerMode);
            }
            if (this.config.freezeAdaptiveBudget && root.LightflowFrameBudget?.setEnabled) {
                root.LightflowFrameBudget.setEnabled(false);
            }
        }
        async restore(config) {
            for (let i = this.restorers.length - 1; i >= 0; i--) {
                try { await this.restorers[i](); } catch (error) { console.warn('[Lightflow Test Lab] Restore step failed.', error); }
            }
            if (config.suite !== 'manual_workflow' && root.LightflowPerformanceIsolation?.reset) {
                root.LightflowPerformanceIsolation.reset();
                Object.entries(this.passOverrides || {}).forEach(([pass, enabled]) => {
                    root.LightflowPerformanceIsolation.set(pass, enabled !== false);
                });
            }
            if (root.LightflowFrameBudget?.setEnabled && this.frameBudget) {
                root.LightflowFrameBudget.setEnabled(this.frameBudget.enabled !== false);
                if (Number.isFinite(this.frameBudget.targetFps)) root.LightflowFrameBudget.setTargetFps(this.frameBudget.targetFps);
            }
            if (this.profilerMode && root.LightflowFrameProfiler?.setMode) root.LightflowFrameProfiler.setMode(this.profilerMode);
            if (config.suite !== 'manual_workflow' && this.originalMode && getMode() !== this.originalMode) {
                await switchMode(this.originalMode, { ...DEFAULT_CONFIG, ...config }, null);
            }
            // A manual recording observes the artist's edits and saves. Its
            // cleanup must never undo their mode choice or saved/unsaved state.
            if (config.suite !== 'manual_workflow' && root.Project === this.project && root.Project && typeof this.projectSaved === 'boolean') root.Project.saved = this.projectSaved;
        }
    }

    class TestRunner {
        constructor(config = {}) {
            this.config = normalizeConfig(config);
            this.report = createReport(this.config);
            this.capture = new RuntimeCapture(this.config, this.report);
            this.transaction = new StateTransaction(this.config);
            this.progress = new ProgressPresenter(this.config, this.report);
            this.currentScenario = null;
            this.cancelled = false;
            this.running = false;
            this.resourceBaseline = null;
            this.programBaselineAfterModeStress = null;
            this.bootstrapSession = null;
            this.restoring = false;
        }

        async run() {
            if (this.running) throw new Error('Lightflow Test Lab is already running.');
            this.running = true;
            this.report.startedAt = wallIso();
            let transactionPrepared = false;
            try {
                this.capture.start();
                this.report.hostInitial = getArchitectureSnapshot();
                const hostTransaction = this.transaction;
                transactionPrepared = true;
                hostTransaction.prepare();
                if (this.config.bootstrapProject) {
                    this.bootstrapSession = new PerformanceProjectSession(root, {
                        includeAnimation: this.config.bootstrapIncludeAnimation,
                        includeLights: typeof root.LightElement === 'function',
                        assertActive: () => this.assertNotCancelled(),
                        settle: async project => {
                            const settled = await this.waitForProjectSettled(project);
                            this.bootstrapSession.operations.push({ operation: 'settle', projectId: project.uuid, ...toSerializable(settled) });
                            if (!settled.ok) throw new Error('Temporary project did not finish loading and warming shaders.');
                        },
                        restoreSettle: () => frames(2)
                    });
                    await this.bootstrapSession.openFixtures(this.config.bootstrapFixtureCount);
                    // The benchmark mutates the fixture, so its transaction must
                    // snapshot after bootstrap. The pre-existing user project is
                    // only restored by the owned-session cleanup below.
                    this.transaction = new StateTransaction(this.config);
                    this.transaction.profilerMode = hostTransaction.profilerMode;
                    this.transaction.frameBudget = hostTransaction.frameBudget;
                    this.transaction.passOverrides = hostTransaction.passOverrides;
                }
                if (!root.Project || !getPreview()?.renderer) throw new Error('Open a Blockbench project with an active preview before running the suite.');
                this.report.environment = buildEnvironmentSnapshot();
                this.report.initial = getArchitectureSnapshot();
                transactionPrepared = true;
                this.transaction.prepare();
                this.report.initialWebGLErrors = drainWebGLErrors();
                this.capture.shaderCapture?.start(getPreview()?.renderer);
                await this.runSuite();
            } catch (error) {
                this.report.fatalError = toSerializable(error);
                console.error('[Lightflow Test Lab] Suite failed.', error);
            } finally {
                this.restoring = true;
                this.capture.phase = 'restoration';
                this.report.cancelled = this.cancelled;
                this.report.cleanupErrors = [];
                try { if (transactionPrepared) await this.transaction.restore(this.config); }
                catch (error) { this.report.cleanupErrors.push({ phase: 'state_restore', error: toSerializable(error) }); }
                // Compare like with like: capture fixture resources before closing
                // it, and keep the restored user's context in a separate snapshot.
                this.report.final = getArchitectureSnapshot();
                try { await this.bootstrapSession?.dispose?.(); }
                catch (error) { this.report.cleanupErrors.push({ phase: 'temporary_projects', error: toSerializable(error), projects: error.projects }); }
                this.report.projectLifecycle = this.bootstrapSession ? {
                    operations: this.bootstrapSession.operations,
                    remainingOwned: this.bootstrapSession.owned.map(project => project.uuid),
                    originalProjectId: this.bootstrapSession.originalProject?.uuid || null,
                    restoredProjectId: root.Project?.uuid || null
                } : null;
                this.report.afterCleanup = getArchitectureSnapshot();
                this.capture.stop();
                this.report.finishedAt = wallIso();
                this.report.durationMs = round(now() - this.capture.startedAt);
                this.report.summary = buildReportSummary(this.report);
                this.report.performanceDiagnostics = buildPerformanceDiagnosticSummary(this.report);
                this.progress.finish(this.report.summary);
                this.report.progress = this.progress.snapshot();
                this.running = false;
            }
            return this.report;
        }

        cancel() {
            this.cancelled = true;
            FrameSampler.stopAll();
            if (this.currentScenario && /studio/.test(this.currentScenario.id)) {
                root.StudioRender?.cancelRender?.('test_lab_cancelled');
            }
        }

        assertNotCancelled() {
            if (this.cancelled && !this.restoring) throw new Error('Lightflow Test Lab run cancelled.');
        }

        async runSuite() {
            const suite = this.config.suite;
            if (this.config.runPreflight) await this.runPreflightScenario();
            await this.scenario('00.current.warmup_stability', 'Current scene warm-up stability', async scenario => {
                const warmup = await waitForWarmupStable(this.config, milestone => scenario.milestones.push(milestone));
                scenario.warmup = warmup;
                if (!warmup.ok) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: warmup.stalled
                            ? 'warmup_scheduler_stall'
                            : (warmup.timedOut ? 'warmup_timeout' : 'warmup_failed'),
                        durationMs: warmup.durationMs,
                        maxPollGapMs: warmup.maxPollGapMs || null,
                        failedDelta: warmup.failedDelta || 0
                    });
                }
                await this.measureIdle(scenario, this.config.settleDurationMs);
            });

            if (suite === 'shader_compilation') {
                if (this.config.bootstrapProject) await this.runBootstrapProjectLifecycleScenario();
                await this.scenario('10.compile.rendercraft', 'Rendercraft first activation', async scenario => {
                    await switchMode('cinematic_craft', this.config, scenario);
                    await this.measureIdle(scenario);
                });
                await this.runLightTopologyStressScenario();
                if (this.compilationDiagnosticsBlocked) return;
                await this.runLightTopologyStressScenario('11.compile.repeated_light_topology');
                if (this.compilationDiagnosticsBlocked) return;
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            if (suite === 'atmosphere_v2') {
                await this.runAtmosphereDiagnosticsScenarios();
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            if (suite === 'bedrock_structure') {
                await this.runBedrockStructureScenarios();
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            if (suite === 'manual_workflow') {
                await this.scenario('20.manual.workflow', 'Recording manual edits, mode changes and saves', scenario =>
                    this.measureIdle(scenario, this.config.manualWorkflowDurationMs));
                return;
            }

            if (suite === 'workflow') {
                if (this.report.scenarios.find(s => s.id === '00.current.warmup_stability')?.status !== 'passed') return;
                await this.runWorkflowDiagnosticsScenarios();
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            if (suite === 'volume_complete') {
                await this.runVolumeCompleteScenarios();
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            if (!this.config.runCoreScenarios) {
                if (this.config.runProjectSwitching) await this.runProjectSwitchingScenario();
                if (this.config.runAnimationMatrix) await this.runAnimationDiagnosticsMatrix();
                if (this.config.runAnimationIsolation) await this.runAnimationFeatureIsolationScenarios();
                if (this.config.runStress) await this.runStressScenarios();
                if (this.config.runSoak) await this.runSoakScenario();
                if (this.config.runContextRecovery) await this.runContextRecoveryScenario();
                if (this.config.runLeakAudit) await this.runLeakAuditScenario();
                return;
            }

            await this.scenario('01.current.idle', 'Current scene idle', scenario => this.measureIdle(scenario));
            if (this.config.runCamera) await this.scenario('02.current.camera_orbit', 'Current scene camera orbit', scenario => this.measureCameraOrbit(scenario));

            if (this.config.runEditTransform) {
                await this.scenario('03.current.edit_transform', 'Edit-mode cube transform', scenario => this.measureEditTransform(scenario));
            }
            if (this.config.runAnimation) {
                await this.scenario('04.current.animation_playback', 'Native animation playback', scenario => this.measureAnimationPlayback(scenario));
            }
            if (this.config.runLightTests) {
                await this.scenario('05.current.light_transform', 'Existing light transform', scenario => this.measureLightTransform(scenario));
                await this.scenario('06.current.shadows_off', 'Existing light shadows disabled', scenario => this.measureShadowsToggle(scenario, false));
                await this.scenario('07.current.shadows_on', 'Existing light shadows enabled', scenario => this.measureShadowsToggle(scenario, true));
                await this.scenario('08.current.add_light', 'Temporary light topology change', scenario => this.measureTemporaryLight(scenario));
            }

            if (this.config.bootstrapProject) {
                await this.runBootstrapProjectLifecycleScenario();
            }

            if (this.config.runFeatureToggles) await this.runRealFeatureToggleScenarios();
            if (this.config.runFeatureIsolation) await this.runFeatureIsolationScenarios();
            if (this.config.runVolumeMatrix) {
                await this.runVolumeCompleteScenarios();
            }

            if (this.config.runNoOverridesFixture) {
                const overrides = snapshotOverrideState();
                const hadOverrides = !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false);
                await this.scenario('20.fixture.no_overrides.prepare', 'Temporary no-overrides fixture', async scenario => {
                    scenario.hadOverrides = hadOverrides;
                    clearOverrides(overrides);
                    await frames(2);
                    scenario.hasOverridesAfterClear = !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false);
                    await this.measureIdle(scenario, this.config.settleDurationMs);
                });
                try {
                    if (this.config.runModeCycle) await this.runModeCycle('no_overrides');
                } finally {
                    restoreOverrides(overrides);
                    await frames(2);
                }
                await this.scenario('29.fixture.overrides_restored', 'Original overrides restored', async scenario => {
                    scenario.hasOverrides = !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false);
                    await this.measureIdle(scenario, this.config.settleDurationMs);
                });
                if (hadOverrides && this.config.runModeCycle && this.config.runOverrideModeCycle) {
                    await this.runModeCycle('overrides');
                }
            } else if (this.config.runModeCycle) {
                await this.runModeCycle('current');
            }

            if (this.config.includeStudio && suite !== 'quick') await this.runStudioScenarios();
            if (this.config.runProjectSwitching) await this.runProjectSwitchingScenario();
            if (this.config.runAnimationMatrix) await this.runAnimationDiagnosticsMatrix();
            if (this.config.runAnimationIsolation) await this.runAnimationFeatureIsolationScenarios();
            if (this.config.runStress) await this.runStressScenarios();
            if (this.config.runSoak) await this.runSoakScenario();
            if (this.config.runContextRecovery) await this.runContextRecoveryScenario();
            if (this.config.runLeakAudit) await this.runLeakAuditScenario();
        }

        async runBootstrapProjectLifecycleScenario() {
            await this.scenario('59.bootstrap.project_lifecycle', 'Temporary project open, switch, close and reopen', async scenario => {
                const session = this.bootstrapSession || new PerformanceProjectSession(root, { includeAnimation: this.config.bootstrapIncludeAnimation });
                const ownsSession = session !== this.bootstrapSession;
                const original = root.Project || null;
                try {
                    const fixtures = session.owned.length
                        ? session.owned.slice()
                        : await session.openFixtures(this.config.bootstrapFixtureCount);
                    scenario.fixturesOpened = fixtures.map(project => ({
                        id: project?.uuid || project?.id || null,
                        name: project?.name || null,
                        owned: session.owned.includes(project)
                    }));
                    for (const fixture of fixtures) {
                        this.assertNotCancelled();
                        const started = now();
                        fixture?.select?.();
                        const settled = await this.waitForProjectSettled(fixture, { startedAt: started });
                        session.operations.push({ operation: 'switch', projectId: fixture.uuid, ...toSerializable(settled) });
                        if (!settled.ok) throw new Error('Temporary project switch did not settle.');
                    }
                    if (this.config.bootstrapCloseReopen) {
                        // Keep the active fixture (and its transaction) alive.
                        // Close and reopen the other project from identical input.
                        const target = fixtures.find(project => project !== root.Project);
                        const targetIndex = session.owned.indexOf(target);
                        const reopenIndex = Math.max(0, targetIndex);
                        if (!target || session.originalProjects.has(target)) throw new Error('No owned fixture is available to reopen.');
                        const started = now();
                        await target.close(true);
                        if (root.ModelProject.all.includes(target)) throw new Error('Temporary project refused to close.');
                        session.owned.splice(session.owned.indexOf(target), 1);
                        session.operations.push({ operation: 'close_reopen', projectId: target.uuid, callMs: round(now() - started) });
                        const reopened = await session.openFixture(reopenIndex);
                        scenario.reopened = { id: reopened?.uuid || reopened?.id || null, name: reopened?.name || null };
                        original?.select?.();
                        await this.waitForProjectSettled(original);
                    }
                } finally {
                    if (ownsSession) {
                        await session.dispose();
                        if (original && root.Project !== original) original.select?.();
                    }
                }
            });
        }

        async runAtmosphereDiagnosticsScenarios() {
            const requiredDiagnosticFields = [
                'resolvedTechnique', 'activeFogLayers', 'activeAnalyticVolumes',
                'activeRaymarchVolumes', 'culledVolumes', 'projectedCoverage',
                'activeBounds', 'fogPixelsSubmitted', 'activeLights',
                'candidateLights', 'shadowedLights', 'raymarches',
                'effectiveSteps', 'estimatedRaySamples', 'noiseOctaves',
                'shadowSamples', 'canonicalDepthHits', 'legacyDepthHits',
                'depthFallbackCaptures', 'historyAcceptanceRate',
                'historyRejections', 'historyRejectReason', 'staticCacheHits',
                'bloomReuseHits', 'bloomExtraRaymarches', 'avoidedRaymarches',
                'renderTargetBytes', 'atmosphereGpuMs'
            ];

            await this.scenario('80.atmosphere.router_diagnostics', 'Atmosphere 2.0 router and diagnostics', async scenario => {
                const preview = getPreview();
                const manager = root.LightflowAtmosphere;
                const router = root.AtmosphereTechniqueRouter;
                if (!preview || !manager || !router) {
                    throw new Error('Atmosphere 2.0 runtime contracts are unavailable.');
                }
                const volumes = safe(() => manager.getActiveVolumes?.(preview.camera), []) || [];
                const resolution = manager.getTechniqueResolution?.(preview, {}, volumes);
                const diagnostics = manager.getResourceDiagnostics?.(preview);
                const missingFields = requiredDiagnosticFields.filter(field => !(field in (diagnostics || {})));
                scenario.atmosphere = {
                    activeVolumeCount: volumes.length,
                    resolution: toSerializable(resolution),
                    diagnostics: toSerializable(diagnostics),
                    missingFields
                };
                if (!resolution?.resolvedTechnique || missingFields.length) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'atmosphere_v2_diagnostics_contract',
                        resolvedTechnique: resolution?.resolvedTechnique || null,
                        missingFields
                    });
                }
                if (!volumes.length) {
                    scenario.warnings.push({
                        type: 'no_active_atmosphere_volume',
                        impact: 'depth_and_bloom_runtime_checks_will_be_skipped'
                    });
                }
            });

            await this.scenario('81.atmosphere.canonical_depth', 'Atmosphere canonical SceneDepth reuse', async scenario => {
                const preview = getPreview();
                const manager = root.LightflowAtmosphere;
                const volumes = safe(() => manager?.getActiveVolumes?.(preview?.camera), []) || [];
                if (!preview || !manager || !volumes.length) {
                    scenario.status = 'skipped';
                    scenario.warnings.push({ type: 'canonical_depth_check_requires_active_volume' });
                    return;
                }
                const before = manager.performance?.() || {};
                safe(() => preview.render?.(), null);
                await frames(3);
                const after = manager.performance?.() || {};
                const canonicalDepthHits = numericDelta(before.canonicalDepthHits, after.canonicalDepthHits);
                const fallbackCaptures = numericDelta(before.depthFallbackCaptures, after.depthFallbackCaptures);
                const canonicalDepthObserved = canonicalDepthHits > 0 || Number(before.canonicalDepthHits) > 0;
                scenario.atmosphere = { before, after, canonicalDepthHits, fallbackCaptures, canonicalDepthObserved };
                if (!canonicalDepthObserved || fallbackCaptures > 0) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'atmosphere_canonical_depth_not_reused',
                        canonicalDepthHits,
                        fallbackCaptures
                    });
                }
            });

            await this.scenario('82.atmosphere.bloom_single_integration', 'Atmosphere Bloom reuses beauty integration', async scenario => {
                const preview = getPreview();
                const manager = root.LightflowAtmosphere;
                const volumes = safe(() => manager?.getActiveVolumes?.(preview?.camera), []) || [];
                if (!preview || !manager || !volumes.length) {
                    scenario.status = 'skipped';
                    scenario.warnings.push({ type: 'bloom_reuse_check_requires_active_volume' });
                    return;
                }
                manager.invalidateSceneCache?.();
                const before = manager.performance?.() || {};
                const resolution = manager.getTechniqueResolution?.(preview, { studio: true }, volumes) || {};
                const beautyRendered = manager.composite?.(preview, { studio: true });
                const afterBeauty = manager.performance?.() || {};
                const bloomRendered = manager.composite?.(preview, { studio: true, bloomMask: true });
                const afterBloom = manager.performance?.() || {};
                const beautyRaymarches = numericDelta(before.raymarches, afterBeauty.raymarches);
                const bloomRaymarches = numericDelta(afterBeauty.raymarches, afterBloom.raymarches);
                const bloomReuseHits = numericDelta(afterBeauty.bloomReuseHits, afterBloom.bloomReuseHits);
                const bloomExtraRaymarches = numericDelta(afterBeauty.bloomExtraRaymarches, afterBloom.bloomExtraRaymarches);
                const expectedBeautyRaymarches = resolution.activeRaymarchVolumes > 0 ? 1 : 0;
                scenario.atmosphere = {
                    beautyRendered: !!beautyRendered,
                    bloomRendered: !!bloomRendered,
                    beautyRaymarches,
                    bloomRaymarches,
                    bloomReuseHits,
                    bloomExtraRaymarches,
                    expectedBeautyRaymarches
                };
                if (!beautyRendered || !bloomRendered || beautyRaymarches !== expectedBeautyRaymarches ||
                    bloomRaymarches !== 0 || bloomReuseHits < 1 || bloomExtraRaymarches !== 0) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'atmosphere_bloom_duplicate_integration',
                        ...scenario.atmosphere
                    });
                }
                safe(() => preview.render?.(), null);
                await frames(2);
            });
        }

        async runBedrockStructureScenarios() {
            const studio = root.BedrockStructureStudio;
            await this.scenario('90.bedrock.preflight', 'Bedrock Structure runtime preflight', async scenario => {
                scenario.available = !!studio;
                scenario.structureProject = !!safe(() => studio?.isStructureProject?.(), false);
                scenario.version = studio?.version || null;
                if (!scenario.available || !scenario.structureProject) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'bedrock_structure_runtime_unavailable',
                        available: scenario.available,
                        structureProject: scenario.structureProject,
                        version: scenario.version,
                    });
                    return;
                }
                const started = now();
                while (Number(studio.getOptimizedPreviewStats?.()?.pendingChunks || 0) > 0
                    && now() - started < this.config.warmupTimeoutMs) await frames(1);
                scenario.preview = toSerializable(studio.getOptimizedPreviewStats?.());
                if (Number(scenario.preview?.pendingChunks || 0) > 0) {
                    scenario.status = 'failed';
                    scenario.errors.push({type: 'bedrock_progressive_mesh_timeout', pendingChunks: scenario.preview.pendingChunks});
                }
            });

            await this.scenario('91.bedrock.pipeline_diagnostics', 'Bedrock load, mesh, memory and atlas diagnostics', async scenario => {
                scenario.performance = toSerializable(studio?.getPerformanceDiagnostics?.());
                scenario.terrain = toSerializable(studio?.getTerrainDiagnostics?.());
                scenario.atlas = toSerializable(studio?.getResourcePackAtlasStats?.());
                const blocks = Number(scenario.terrain?.blockCount || 0);
                const sections = Number(scenario.terrain?.sectionCount || 0);
                const drawMeshes = Number(scenario.terrain?.drawMeshCount || 0);
                if (!(blocks >= 0) || !(sections >= 0) || drawMeshes !== sections) {
                    scenario.status = 'failed';
                    scenario.errors.push({type: 'bedrock_terrain_diagnostics_inconsistent', blocks, sections, drawMeshes});
                }
                if (scenario.atlas && Number(scenario.atlas.pending || 0) > 0) {
                    scenario.status = 'failed';
                    scenario.errors.push({type: 'bedrock_atlas_entries_pending', pending: scenario.atlas.pending});
                }
                await this.measureIdle(scenario, this.config.settleDurationMs);
            });

            await this.scenario('92.bedrock.incremental_edit', 'Bedrock local section rebuild benchmark', async scenario => {
                scenario.benchmark = toSerializable(studio?.runIncrementalBenchmark?.(this.config.bedrockEditIterations || 12));
                if (!scenario.benchmark?.ok) {
                    scenario.status = 'failed';
                    scenario.errors.push({type: 'bedrock_incremental_benchmark_unavailable', benchmark: scenario.benchmark});
                } else if (!Number.isFinite(Number(scenario.benchmark.p95Ms))) {
                    scenario.status = 'failed';
                    scenario.errors.push({type: 'bedrock_incremental_benchmark_invalid', benchmark: scenario.benchmark});
                } else if (Number(scenario.benchmark.p95Ms) > Number(this.config.bedrockMaxIncrementalP95Ms || 50)) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'bedrock_incremental_p95_budget_exceeded',
                        p95Ms: scenario.benchmark.p95Ms,
                        budgetMs: this.config.bedrockMaxIncrementalP95Ms,
                    });
                } else if (Number(scenario.benchmark.p95Ms) > Number(this.config.bedrockTargetIncrementalMs || 16.7)) {
                    scenario.warnings.push({
                        type: 'bedrock_incremental_above_realtime_target',
                        p95Ms: scenario.benchmark.p95Ms,
                        targetMs: this.config.bedrockTargetIncrementalMs,
                    });
                }
                await frames(2);
            });

            if (this.config.runCamera) {
                await this.scenario('93.bedrock.camera_orbit', 'Bedrock real-time viewport orbit', scenario => this.measureCameraOrbit(scenario));
            }
        }

        async runVolumeCompleteScenarios() {
            const preview = getPreview();
            const manager = root.LightflowAtmosphere;
            const router = root.AtmosphereTechniqueRouter;
            const VolumeClass = root.LightflowVolumeElement;
            if (!preview || !manager || !router || typeof VolumeClass !== 'function') {
                await this.scenario('83.volume.preflight', 'Volume complete-suite preflight', scenario => {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'volume_runtime_unavailable',
                        preview: !!preview,
                        manager: !!manager,
                        router: !!router,
                        volumeClass: typeof VolumeClass
                    });
                });
                return;
            }

            const originalVolumes = Array.isArray(VolumeClass.all) ? VolumeClass.all.slice() : [];
            const originalVolumeStates = originalVolumes.map(volume => ({
                volume,
                config: snapshotVolumeConfig(volume)
            }));
            const originalSettings = Object.fromEntries(
                Object.entries(manager.settings || {}).map(([key, value]) => [key, cloneDiagnosticValue(value)])
            );
            const originalSaved = root.Project?.saved;
            const anchor = originalVolumes[0];
            const basePosition = Array.isArray(anchor?.position) ? anchor.position.slice() : [0, 8, 0];
            const baseSize = Array.isArray(anchor?.size) ? anchor.size.slice() : [32, 16, 32];
            const createdVolumes = [];
            let fixture = null;
            let shaftLight = null;

            const renderFrames = async (count = 3, invalidate = true) => {
                if (invalidate) manager.invalidateSceneCache?.();
                safe(() => preview.render?.(), null);
                await frames(count);
            };
            const makeVolume = config => {
                const volume = new VolumeClass({
                    name: '__lightflow_test_lab_volume__',
                    position: basePosition.slice(),
                    rotation: [0, 0, 0],
                    size: baseSize.slice(),
                    shape: 'box',
                    density_mode: 'uniform',
                    composite_mode: 'physical',
                    density: 0.045,
                    scattering_color: [188, 220, 255],
                    scattering_strength: 0.8,
                    absorption_color: [220, 232, 245],
                    absorption: 0.16,
                    anisotropy: 0.18,
                    ambient: 0.18,
                    shadow_fill: 0.12,
                    receive_shadows: true,
                    edge_feather: 0.14,
                    height_falloff: 1.35,
                    height_offset: 0.12,
                    noise_scale: 3.2,
                    noise_detail: 3,
                    coverage: 0.42,
                    erosion: 0.24,
                    visibility: true,
                    enabled: true,
                    ...(config || {})
                });
                volume.addTo?.();
                volume.init?.();
                createdVolumes.push(volume);
                safe(() => root.Blockbench?.dispatchEvent?.('add_lightflow_volume', {
                    object: volume,
                    source: 'lightflow_test_lab'
                }), null);
                return volume;
            };

            try {
                manager.settings = {
                    ...manager.settings,
                    enabled: true,
                    global_fog_enabled: false,
                    static_cache: true,
                    temporal_response: 'balanced',
                    temporal_jitter: false,
                    preview_scale: 1,
                    render_scale: 1
                };
                originalVolumes.forEach(volume => {
                    volume.enabled = false;
                    root.LightflowVolumeElement?.preview_controller?.updateTransform?.(volume);
                });
                if (typeof root.LightElement === 'function') {
                    // An arbitrary existing sun may project off screen, where
                    // zero shaft pixels is correct. Use a reproducible source
                    // inside the camera's upper quadrant for this fixture.
                    const source = new root.THREE.Vector3(0.35, 0.55, 0).unproject(preview.camera);
                    shaftLight = new root.LightElement({ name: '__lightflow_test_lab_shaft_source__',
                        light_type: 'point', position: source.toArray(), color: [255, 255, 255],
                        intensity: 1, distance: 0, has_shadow: false, visibility: true });
                    shaftLight.addTo?.();
                    shaftLight.init?.();
                    notifyLightsChanged([shaftLight], { shadows: true, scene: true });
                }
                fixture = makeVolume();
                if (shaftLight) fixture.light_uuid = shaftLight.uuid;
                await renderFrames(3);

                // These contracts need a real active volume. Running them
                // before creating the fixture silently skipped both checks.
                await this.runAtmosphereDiagnosticsScenarios();

                await this.scenario('83.volume.lifecycle_serialization', 'Volume lifecycle, mesh, Undo copy and serialization', async scenario => {
                    const saved = fixture.getSaveCopy?.();
                    const undo = fixture.getUndoCopy?.();
                    const roundTrip = new VolumeClass(saved);
                    const fields = [
                        'position', 'rotation', 'size', 'shape', 'density_mode', 'composite_mode',
                        'density', 'scattering_color', 'scattering_strength', 'absorption_color',
                        'absorption', 'anisotropy', 'ambient', 'shadow_fill', 'receive_shadows',
                        'edge_feather', 'height_falloff', 'height_offset', 'noise_scale',
                        'noise_detail', 'coverage', 'erosion', 'wind_direction', 'wind_speed',
                        'enabled', 'visibility', 'technique_override', 'intent', 'light_uuid',
                        'shaft_length', 'shaft_decay', 'shaft_radius', 'shaft_exposure'
                    ];
                    const mismatches = fields.filter(field => (
                        JSON.stringify(saved?.[field]) !== JSON.stringify(roundTrip?.[field])
                    ));
                    scenario.volumeLifecycle = {
                        uuid: fixture.uuid,
                        registered: VolumeClass.all?.includes?.(fixture) === true,
                        hasMesh: !!fixture.mesh,
                        hasBoxGizmo: !!fixture.mesh?.boxGizmo,
                        hasSphereGizmo: !!fixture.mesh?.sphereGizmo,
                        undoUuidPreserved: undo?.uuid === fixture.uuid,
                        serializedType: saved?.type,
                        mismatches
                    };
                    if (!scenario.volumeLifecycle.registered || !scenario.volumeLifecycle.hasMesh ||
                        !scenario.volumeLifecycle.hasBoxGizmo || !scenario.volumeLifecycle.hasSphereGizmo ||
                        !scenario.volumeLifecycle.undoUuidPreserved || saved?.type !== 'lightflow_volume' || mismatches.length) {
                        scenario.status = 'failed';
                        scenario.errors.push({ type: 'volume_lifecycle_or_serialization_contract', ...scenario.volumeLifecycle });
                    }
                });

                await this.scenario('84.volume.router_matrix', 'All volume shapes, density modes and composition routes', scenario => {
                    scenario.routerMatrix = VOLUME_RENDER_CASES.map(testCase => {
                        const actual = router.resolve({
                            volume: testCase,
                            intent: testCase.intent,
                            quality: 'balanced',
                            studio: false
                        });
                        return { id: testCase.id, expected: testCase.expected, actual, passed: actual === testCase.expected };
                    });
                    const failed = scenario.routerMatrix.filter(result => !result.passed);
                    if (failed.length) {
                        scenario.status = 'failed';
                        scenario.errors.push({ type: 'volume_router_matrix_mismatch', failed });
                    }
                });

                for (let index = 0; index < VOLUME_RENDER_CASES.length; index++) {
                    const testCase = VOLUME_RENDER_CASES[index];
                    await this.scenario(
                        `${85 + index}.volume.viewport.${testCase.id}`,
                        `Viewport volume: ${testCase.id}`,
                        async scenario => {
                            fixture.enabled = false;
                            await renderFrames(2);
                            const beforePixels = capturePreviewPixels();
                            applyDiagnosticVolumeConfig(fixture, {
                                ...testCase,
                                technique_override: 'auto',
                                enabled: true,
                                visibility: true,
                                position: basePosition,
                                size: baseSize,
                                rotation: [0, 0, 0]
                            });
                            const performanceBefore = manager.performance?.() || {};
                            await renderFrames(testCase.density_mode === 'cloud' ? 5 : 3);
                            const performanceAfter = manager.performance?.() || {};
                            const state = manager.states?.get?.(preview);
                            const projected = state?.lastProjectedBounds?.sceneRect || null;
                            const framebuffer = state?.framebufferViewport;
                            const afterPixels = capturePreviewPixels();
                            const physicalRect = mapVolumeBoundsToCapture(projected, framebuffer, afterPixels);
                            const pixels = compareVolumePixels(beforePixels, afterPixels, physicalRect);
                            const resolution = manager.getTechniqueResolution?.(preview, {}, [fixture]) || {};
                            scenario.volumeViewport = {
                                case: testCase.id,
                                requested: toSerializable(testCase),
                                resolvedTechnique: resolution.resolvedTechnique,
                                expectedTechnique: testCase.expected,
                                physicalViewport: toSerializable(state?.framebufferViewport),
                                projectedBounds: toSerializable(state?.lastProjectedBounds),
                                pixels,
                                shaftSource: testCase.composite_mode === 'shafts' ? {
                                    uuid: fixture.light_uuid, uv: toSerializable(state?.shaftUniforms?.uLightUv?.value)
                                } : null,
                                performanceDelta: {
                                    raymarches: numericDelta(performanceBefore.raymarches, performanceAfter.raymarches),
                                    analyticPasses: numericDelta(performanceBefore.analyticPasses, performanceAfter.analyticPasses),
                                    depthFallbackCaptures: numericDelta(performanceBefore.depthFallbackCaptures, performanceAfter.depthFallbackCaptures)
                                }
                            };
                            const isShaft = testCase.composite_mode === 'shafts';
                            const failures = [];
                            if (resolution.resolvedTechnique !== testCase.expected) failures.push('unexpected_technique');
                            if (!physicalRect) failures.push('missing_projected_bounds');
                            if (!pixels.available) failures.push('pixel_capture_unavailable');
                            else {
                                if (pixels.changedPixels < 16) failures.push('no_visible_volume_contribution');
                                if (!isShaft && pixels.outsideChangedRatio > 0.02) failures.push('volume_bleeds_outside_projected_bounds');
                                if (!isShaft && pixels.newlyClippedRatio > 0.2) failures.push('physical_volume_overexposed');
                            }
                            if (failures.length) {
                                scenario.status = 'failed';
                                scenario.errors.push({ type: 'volume_viewport_contract', failures, evidence: scenario.volumeViewport });
                            }
                        }
                    );
                }

                await this.scenario('92.volume.transform_dpi', 'Volume transform, resize and physical viewport alignment', async scenario => {
                    applyDiagnosticVolumeConfig(fixture, {
                        shape: 'box', density_mode: 'uniform', composite_mode: 'physical', intent: 'physical_medium',
                        position: basePosition.slice(), rotation: [0, 0, 0], size: baseSize.slice(), enabled: true
                    });
                    await renderFrames(3);
                    const stateBefore = manager.states?.get?.(preview);
                    const boundsBefore = toSerializable(stateBefore?.lastProjectedBounds);
                    const initialPosition = fixture.position.slice();
                    fixture.resize?.(size => size + 5, 0, false, false, false);
                    fixture.rotation = [17, 31, 9];
                    root.LightflowVolumeElement?.preview_controller?.updateTransform?.(fixture);
                    await renderFrames(3);
                    const stateAfter = manager.states?.get?.(preview);
                    const physical = stateAfter?.framebufferViewport;
                    const drawing = preview.renderer.getDrawingBufferSize?.(new root.THREE.Vector2());
                    scenario.transformDpi = {
                        positionUnchangedByResize: JSON.stringify(fixture.position) === JSON.stringify(initialPosition),
                        expectedSizeX: baseSize[0] + 5,
                        actualSizeX: fixture.size[0],
                        rotation: fixture.rotation.slice(),
                        boundsBefore,
                        boundsAfter: toSerializable(stateAfter?.lastProjectedBounds),
                        rendererPixelRatio: preview.renderer.getPixelRatio?.() || root.devicePixelRatio || 1,
                        drawingBuffer: toSerializable(drawing),
                        physicalViewport: toSerializable(physical)
                    };
                    const failures = [];
                    if (!scenario.transformDpi.positionUnchangedByResize) failures.push('resize_shifted_center');
                    if (Math.abs(fixture.size[0] - (baseSize[0] + 5)) > 0.001) failures.push('resize_dimension_mismatch');
                    if (!physical || physical.z <= 0 || physical.w <= 0) failures.push('physical_viewport_missing');
                    if (!stateAfter?.lastProjectedBounds) failures.push('projected_bounds_missing_after_transform');
                    if (failures.length) {
                        scenario.status = 'failed';
                        scenario.errors.push({ type: 'volume_transform_dpi_contract', failures, evidence: scenario.transformDpi });
                    }
                });

                await this.scenario('93.volume.multi_limit_visibility', 'Multiple-volume limit, visibility and enabled-state isolation', async scenario => {
                    applyDiagnosticVolumeConfig(fixture, { enabled: true, visibility: true, rotation: [0, 0, 0], size: baseSize });
                    const extras = [];
                    for (let index = 0; index < 5; index++) {
                        extras.push(makeVolume({
                            name: `__lightflow_test_lab_volume_${index}__`,
                            position: [basePosition[0] + (index - 2) * 2, basePosition[1], basePosition[2]],
                            shape: index % 2 ? 'sphere' : 'box',
                            density_mode: ['uniform', 'height', 'cloud'][index % 3],
                            density: 0.02 + index * 0.005
                        }));
                    }
                    try {
                        await renderFrames(4);
                        const activeAtCapacity = manager.getActiveVolumes?.(preview.camera) || [];
                        extras[0].enabled = false;
                        extras[1].visibility = false;
                        root.LightflowVolumeElement?.preview_controller?.updateTransform?.(extras[1]);
                        await renderFrames(3);
                        const activeAfterDisable = manager.getActiveVolumes?.(preview.camera) || [];
                        scenario.multiVolume = {
                            totalFixtureVolumes: 1 + extras.length,
                            activeAtCapacity: activeAtCapacity.length,
                            activeAfterDisable: activeAfterDisable.length,
                            maxSupported: 4,
                            disabledExcluded: !activeAfterDisable.includes(extras[0]),
                            hiddenExcluded: !activeAfterDisable.includes(extras[1]),
                            diagnostics: toSerializable(manager.getResourceDiagnostics?.(preview))
                        };
                        if (activeAtCapacity.length > 4 || activeAfterDisable.length > 4 ||
                            !scenario.multiVolume.disabledExcluded || !scenario.multiVolume.hiddenExcluded) {
                            scenario.status = 'failed';
                            scenario.errors.push({ type: 'volume_multi_visibility_contract', ...scenario.multiVolume });
                        }
                    } finally {
                        extras.forEach(removeDiagnosticVolume);
                    }
                });

                await this.scenario('94.volume.temporal_cache_invalidation', 'Volume temporal history, static cache and transform invalidation', async scenario => {
                    applyDiagnosticVolumeConfig(fixture, {
                        shape: 'box', density_mode: 'cloud', composite_mode: 'physical', intent: 'physical_medium',
                        position: basePosition, rotation: [0, 0, 0], size: baseSize,
                        wind_speed: 0, enabled: true, visibility: true
                    });
                    const before = manager.performance?.() || {};
                    await renderFrames(4);
                    const afterFirst = manager.performance?.() || {};
                    await renderFrames(3, false);
                    const afterStable = manager.performance?.() || {};
                    fixture.position[0] += 0.75;
                    root.LightflowVolumeElement?.preview_controller?.updateTransform?.(fixture);
                    await renderFrames(4);
                    const afterMove = manager.performance?.() || {};
                    scenario.cacheInvalidation = {
                        firstRaymarches: numericDelta(before.raymarches, afterFirst.raymarches),
                        stableCacheHits: numericDelta(afterFirst.cacheHits, afterStable.cacheHits),
                        movedRaymarches: numericDelta(afterStable.raymarches, afterMove.raymarches),
                        historyRejections: numericDelta(afterStable.historyRejections, afterMove.historyRejections),
                        diagnostics: toSerializable(manager.getResourceDiagnostics?.(preview))
                    };
                    if ((scenario.cacheInvalidation.firstRaymarches ?? 0) < 1 ||
                        (scenario.cacheInvalidation.stableCacheHits ?? 0) < 1 ||
                        (scenario.cacheInvalidation.movedRaymarches ?? 0) < 1) {
                        scenario.status = 'failed';
                        scenario.errors.push({ type: 'volume_cache_invalidation_contract', ...scenario.cacheInvalidation });
                    }
                });

                await this.scenario('95.volume.studio_render_matrix', 'Studio Render matrix for every volume technique', async scenario => {
                    if (!root.StudioRender?.renderFrame) {
                        scenario.status = 'skipped';
                        scenario.reason = 'studio_render_frame_capture_unavailable';
                        return;
                    }
                    scenario.studioVolumeMatrix = [];
                    scenario.studioScreenshotKeys = [];
                    const studioBase = root.StudioRender.settings || {};
                    const studioSettings = {
                        ...studioBase,
                        resolution_preset: 'custom',
                        resolution: [512, 320],
                        output_scale: 1,
                        samples: '1',
                        tile_size: 'auto',
                        capture_area: 'full',
                        destination: 'preview'
                    };
                    const captureStudioFrame = async fileName => {
                        let pixels = null;
                        let png = null;
                        const result = await root.StudioRender.renderFrame({
                            ...studioSettings,
                            file_name: fileName
                        }, frame => {
                            pixels = captureCanvasPixels(frame?.canvas);
                            png = captureCanvasPng(frame?.canvas);
                        }, { silent: true });
                        return { result, pixels, png };
                    };

                    fixture.enabled = false;
                    root.LightflowVolumeElement?.preview_controller?.updateTransform?.(fixture);
                    manager.invalidateSceneCache?.();
                    const baselineCapture = await captureStudioFrame('lightflow_volume_baseline');
                    scenario.studioBaseline = {
                        ok: baselineCapture.result?.ok !== false,
                        result: toSerializable(baselineCapture.result),
                        pixelHash: hashPixelFrame(baselineCapture.pixels),
                        pixelsAvailable: !!baselineCapture.pixels
                    };
                    if (this.config.captureScreenshots && baselineCapture.png) {
                        const key = '95.volume.studio.baseline.png';
                        this.report.attachments[key] = baselineCapture.png;
                        scenario.studioScreenshotKeys.push(key);
                    }
                    for (const testCase of VOLUME_RENDER_CASES) {
                        this.assertNotCancelled();
                        applyDiagnosticVolumeConfig(fixture, {
                            ...testCase,
                            technique_override: 'auto',
                            enabled: true,
                            visibility: true,
                            position: basePosition,
                            rotation: [0, 0, 0],
                            size: baseSize
                        });
                        const performanceBefore = manager.performance?.() || {};
                        const started = now();
                        let result = null;
                        let error = null;
                        let capturedPixels = null;
                        let capturedPng = null;
                        try {
                            const capture = await captureStudioFrame(`lightflow_volume_${testCase.id}`);
                            result = capture.result;
                            capturedPixels = capture.pixels;
                            capturedPng = capture.png;
                        } catch (caught) {
                            error = caught?.message || String(caught);
                        }
                        const performanceAfter = manager.performance?.() || {};
                        const pixelComparison = compareVolumePixels(baselineCapture.pixels, capturedPixels);
                        const screenshotKey = this.config.captureScreenshots && capturedPng
                            ? `95.volume.studio.${testCase.id}.png`
                            : null;
                        if (screenshotKey) {
                            this.report.attachments[screenshotKey] = capturedPng;
                            scenario.studioScreenshotKeys.push(screenshotKey);
                        }
                        const contentChanged = pixelComparison.available && pixelComparison.changedPixels >= 16;
                        scenario.studioVolumeMatrix.push({
                            id: testCase.id,
                            ok: !error && result?.ok !== false && contentChanged,
                            error,
                            durationMs: round(now() - started),
                            result: toSerializable(result),
                            screenshotKey,
                            pixelHash: hashPixelFrame(capturedPixels),
                            baselineDifference: pixelComparison,
                            diagnostics: toSerializable(root.LightflowStudioRenderDiagnostics),
                            atmosphereDelta: {
                                raymarches: numericDelta(performanceBefore.raymarches, performanceAfter.raymarches),
                                bloomReuseHits: numericDelta(performanceBefore.bloomReuseHits, performanceAfter.bloomReuseHits),
                                bloomExtraRaymarches: numericDelta(performanceBefore.bloomExtraRaymarches, performanceAfter.bloomExtraRaymarches)
                            }
                        });
                        await frames(2);
                    }
                    const failed = scenario.studioVolumeMatrix.filter(item => !item.ok);
                    if (failed.length) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'volume_studio_render_matrix_failed',
                            failed: failed.map(item => ({
                                id: item.id,
                                error: item.error,
                                result: item.result,
                                baselineDifference: item.baselineDifference,
                                pixelHash: item.pixelHash
                            }))
                        });
                    }
                }, { measureRaf: false });
            } finally {
                createdVolumes.slice().reverse().forEach(removeDiagnosticVolume);
                shaftLight?.remove?.();
                originalVolumeStates.forEach(record => applyDiagnosticVolumeConfig(record.volume, record.config));
                manager.settings = originalSettings;
                manager.invalidateSceneCache?.();
                safe(() => preview.render?.(), null);
                await frames(3);
                if (root.Project && typeof originalSaved === 'boolean') root.Project.saved = originalSaved;
            }
        }

        async runPreflightScenario() {
            await this.scenario('00.preflight.architecture_contract', 'Architecture and runtime preflight', async scenario => {
                const preview = getPreview();
                const renderer = preview?.renderer;
                const gl = safe(() => renderer?.getContext?.(), null);
                const graph = safe(() => root.LightflowRenderer?.describeGraph?.(), null);
                const required = {
                    renderer: !!renderer,
                    webglContext: !!gl,
                    lightflowRenderer: !!root.LightflowRenderer,
                    shaderEngine: !!root.ShaderEngine,
                    diagnostics: !!root.LightflowDiagnostics?.snapshot,
                    frameProfiler: !!root.LightflowFrameProfiler,
                    frameBudget: !!root.LightflowFrameBudget
                };
                scenario.preflight = {
                    required,
                    graph: toSerializable(graph),
                    parallelShaderCompile: !!safe(() => gl?.getExtension?.('KHR_parallel_shader_compile'), null),
                    loseContextExtension: !!safe(() => gl?.getExtension?.('WEBGL_lose_context'), null),
                    rendercraftBeauty: toSerializable(safe(() => root.LightflowRenderer?.inspectRendercraft?.('cinematic_craft', {}, 'beauty'), null)),
                    rendercraftBloom: toSerializable(safe(() => root.LightflowRenderer?.inspectRendercraft?.('cinematic_craft', {}, 'studio_bloom'), null)),
                    pbrSurface: toSerializable(safe(() => root.LightflowRenderer?.inspectPbr?.('pbr_metallic_roughness'), null)),
                    lightflowSurface: toSerializable(safe(() => root.LightflowRenderer?.inspectLightflowSurface?.('shaded_lightflow'), null))
                };
                const missing = Object.entries(required).filter(([, present]) => !present).map(([name]) => name);
                const graphErrors = Array.isArray(graph?.validationErrors)
                    ? graph.validationErrors
                    : (Array.isArray(graph?.errors) ? graph.errors : []);
                if (missing.length || graphErrors.length || safe(() => gl?.isContextLost?.(), false)) {
                    scenario.status = 'failed';
                    if (missing.length) scenario.errors.push({ type: 'missing_runtime_contracts', missing });
                    if (graphErrors.length) scenario.errors.push({ type: 'frame_graph_validation', errors: toSerializable(graphErrors) });
                    if (safe(() => gl?.isContextLost?.(), false)) scenario.errors.push({ type: 'context_already_lost' });
                }
                if (!scenario.preflight.parallelShaderCompile) {
                    scenario.warnings.push({ type: 'parallel_shader_compile_unavailable', impact: 'warmup_uses_serial_fallback' });
                }
                await frames(2);
                safe(() => preview?.render?.(), null);
            });
        }

        async runModeCycle(fixtureName) {
            const modeIds = Array.isArray(this.config.modeIds) && this.config.modeIds.length
                ? this.config.modeIds
                : MODE_IDS;
            for (const mode of modeIds) {
                this.assertNotCancelled();
                const transitionScenario = await this.scenario(`30.${fixtureName}.mode.${mode}.transition`, `${fixtureName}: switch to ${MODE_LABELS[mode]}`, async scenario => {
                    scenario.requestedMode = mode;
                    await switchMode(mode, this.config, scenario);
                    await this.measureIdle(scenario, this.config.settleDurationMs);
                });
                if (!transitionScenario.modeTransition?.ok) {
                    const reason = `mode_transition_failed:${mode}`;
                    this.addSkip(`31.${fixtureName}.mode.${mode}.idle`, `${fixtureName}: ${MODE_LABELS[mode]} idle`, reason);
                    if (this.config.runCamera) {
                        this.addSkip(`32.${fixtureName}.mode.${mode}.camera`, `${fixtureName}: ${MODE_LABELS[mode]} camera`, reason);
                    }
                    if (
                        this.config.runInteractionPerMode &&
                        fixtureName !== 'no_overrides' &&
                        (mode === 'lightflow' || mode === 'cinematic_craft')
                    ) {
                        if (this.config.runEditTransform) {
                            this.addSkip(`33.${fixtureName}.mode.${mode}.edit_transform`, `${fixtureName}: ${MODE_LABELS[mode]} edit transform`, reason);
                        }
                        if (this.config.runAnimation) {
                            this.addSkip(`34.${fixtureName}.mode.${mode}.animation`, `${fixtureName}: ${MODE_LABELS[mode]} animation`, reason);
                        }
                    }
                    continue;
                }
                await this.scenario(`31.${fixtureName}.mode.${mode}.idle`, `${fixtureName}: ${MODE_LABELS[mode]} idle`, scenario => this.measureIdle(scenario));
                if (this.config.runCamera) {
                    await this.scenario(`32.${fixtureName}.mode.${mode}.camera`, `${fixtureName}: ${MODE_LABELS[mode]} camera`, scenario => this.measureCameraOrbit(scenario));
                }
                if (
                    this.config.runInteractionPerMode &&
                    fixtureName !== 'no_overrides' &&
                    (mode === 'lightflow' || mode === 'cinematic_craft')
                ) {
                    if (this.config.runEditTransform) {
                        await this.scenario(`33.${fixtureName}.mode.${mode}.edit_transform`, `${fixtureName}: ${MODE_LABELS[mode]} edit transform`, scenario => this.measureEditTransform(scenario));
                    }
                    if (this.config.runAnimation) {
                        await this.scenario(`34.${fixtureName}.mode.${mode}.animation`, `${fixtureName}: ${MODE_LABELS[mode]} animation`, scenario => this.measureAnimationPlayback(scenario));
                    }
                }
            }
        }

        async runRealFeatureToggleScenarios() {
            if (root.LightflowAmbientOcclusion?.applySettings && root.LightflowAmbientOcclusion?.settings) {
                const originalAo = cloneJson(root.LightflowAmbientOcclusion.settings, { ...root.LightflowAmbientOcclusion.settings });
                try {
                    await this.scenario('09.feature.ao.disabled', 'AO setting disabled', async scenario => {
                        scenario.featureMutation = 'LightflowAmbientOcclusion.applySettings({enabled:false})';
                        root.LightflowAmbientOcclusion.applySettings({ ...originalAo, enabled: false }, {
                            persist: false,
                            refresh: true,
                            cause: 'test_lab_ao_off'
                        });
                        await frames(3);
                        await this.measureIdle(scenario);
                    });
                    await this.scenario('09.feature.ao.enabled', 'AO setting enabled', async scenario => {
                        scenario.featureMutation = 'LightflowAmbientOcclusion.applySettings({enabled:true})';
                        root.LightflowAmbientOcclusion.applySettings({ ...originalAo, enabled: true }, {
                            persist: false,
                            refresh: true,
                            cause: 'test_lab_ao_on'
                        });
                        await frames(3);
                        await this.measureIdle(scenario);
                    });
                } finally {
                    root.LightflowAmbientOcclusion.applySettings(originalAo, {
                        persist: false,
                        refresh: true,
                        cause: 'test_lab_ao_restore'
                    });
                }
            } else {
                this.addSkip('09.feature.ao', 'AO settings toggle', 'ao_api_unavailable');
            }

            if (root.StudioRender?.setComposerSettings && root.StudioRender?.settings) {
                const originalStudio = cloneJson(root.StudioRender.settings, root.StudioRender.settings);
                try {
                    await this.scenario('09.feature.bloom.disabled', 'Viewport Bloom disabled', async scenario => {
                        scenario.featureMutation = 'StudioRender.setComposerSettings({viewport_bloom_enabled:false})';
                        root.StudioRender.setComposerSettings({ viewport_bloom_enabled: false });
                        await frames(3);
                        await this.measureIdle(scenario);
                    });
                    await this.scenario('09.feature.bloom.enabled', 'Viewport Bloom enabled', async scenario => {
                        scenario.featureMutation = 'StudioRender.setComposerSettings({viewport_bloom_enabled:true})';
                        root.StudioRender.setComposerSettings({ viewport_bloom_enabled: true });
                        await frames(3);
                        await this.measureIdle(scenario);
                    });
                } finally {
                    root.StudioRender.setComposerSettings(originalStudio);
                }
            } else {
                this.addSkip('09.feature.bloom', 'Viewport Bloom settings toggle', 'studio_composer_api_unavailable');
            }
        }

        async runFeatureIsolationScenarios() {
            const graph = safe(() => root.LightflowRenderer?.describeGraph?.(), null);
            const available = new Set((graph?.registeredPasses || []).map(pass => pass.id));
            const candidates = [
                { passId: 'ao', label: 'Ambient Occlusion', mode: 'lightflow' },
                { passId: 'ssr_resolve', label: 'SSR Resolve', mode: 'cinematic_craft' },
                { passId: 'atmosphere', label: 'Atmosphere', mode: 'lightflow' },
                { passId: 'rendercraft_rim', label: 'Rendercraft Rim', mode: 'cinematic_craft' },
                { passId: 'viewport_composer', label: 'Viewport Composer / Bloom', mode: 'cinematic_craft' }
            ];
            const originalMode = getMode();
            const originalAo = root.LightflowAmbientOcclusion?.settings
                ? cloneJson(root.LightflowAmbientOcclusion.settings, { ...root.LightflowAmbientOcclusion.settings })
                : null;
            const originalStudio = root.StudioRender?.settings
                ? cloneJson(root.StudioRender.settings, root.StudioRender.settings)
                : null;
            const rendercraftMaterial = root.MaterialManager?.materials?.cinematic_craft || null;
            const originalSsr = rendercraftMaterial?.uniforms ? {
                enabled: rendercraftMaterial.uniforms.uSSREnabled?.value,
                intensity: rendercraftMaterial.uniforms.uSSRIntensity?.value
            } : null;
            try {
                for (const candidate of candidates) {
                    const { passId, label, mode } = candidate;
                    if (!available.has(passId) || !root.LightflowPerformanceIsolation?.set) {
                        this.addSkip(`10.isolation.${passId}`, `${label} isolation`, 'pass_unavailable');
                        continue;
                    }

                    // Previous Test Lab versions executed isolation before the mode
                    // matrix, often while Classic was active. That made AO/SSR/Bloom
                    // appear to cost 0 ms simply because their passes were not running.
                    // Each isolation pair now enters the mode that actually owns it.
                    if (mode && getMode() !== mode) {
                        const transition = await switchMode(mode, this.config, null);
                        if (!transition.ok) {
                            this.addSkip(`10.isolation.${passId}.on`, `${label} ON`, `mode_transition_failed:${mode}`);
                            this.addSkip(`11.isolation.${passId}.off`, `${label} OFF`, `mode_transition_failed:${mode}`);
                            continue;
                        }
                        await frames(2);
                    }
                    if (passId === 'ao' && originalAo && root.LightflowAmbientOcclusion?.applySettings) {
                        root.LightflowAmbientOcclusion.applySettings(
                            { ...originalAo, enabled: true },
                            { persist: false, refresh: true, cause: 'test_lab_isolation_ao' }
                        );
                        await frames(2);
                    }
                    if (passId === 'viewport_composer' && root.StudioRender?.setComposerSettings) {
                        root.StudioRender.setComposerSettings({ viewport_bloom_enabled: true });
                        await frames(2);
                    }
                    if (passId === 'ssr_resolve' && rendercraftMaterial?.uniforms) {
                        if (rendercraftMaterial.uniforms.uSSREnabled) rendercraftMaterial.uniforms.uSSREnabled.value = true;
                        if (rendercraftMaterial.uniforms.uSSRIntensity) {
                            rendercraftMaterial.uniforms.uSSRIntensity.value = Math.max(
                                0.55,
                                Number(rendercraftMaterial.uniforms.uSSRIntensity.value) || 0
                            );
                        }
                        root.ShaderEngine?.updateAllUniforms?.('test_lab_isolation_ssr_resolve');
                        await frames(3);
                    }

                    await this.scenario(`10.isolation.${passId}.on`, `${label} ON`, async scenario => {
                        scenario.isolationMode = mode;
                        root.LightflowPerformanceIsolation.set(passId, true);
                        await frames(2);
                        await this.measureIdle(scenario);
                    });
                    await this.scenario(`11.isolation.${passId}.off`, `${label} OFF`, async scenario => {
                        scenario.isolationMode = mode;
                        root.LightflowPerformanceIsolation.set(passId, false);
                        await frames(2);
                        await this.measureIdle(scenario);
                    });
                    root.LightflowPerformanceIsolation.set(passId, true);
                }
            } finally {
                root.LightflowPerformanceIsolation?.reset?.();
                if (originalAo && root.LightflowAmbientOcclusion?.applySettings) {
                    root.LightflowAmbientOcclusion.applySettings(originalAo, {
                        persist: false,
                        refresh: true,
                        cause: 'test_lab_isolation_ao_restore'
                    });
                }
                if (originalStudio && root.StudioRender?.setComposerSettings) {
                    root.StudioRender.setComposerSettings(originalStudio);
                }
                if (originalSsr && rendercraftMaterial?.uniforms) {
                    if (rendercraftMaterial.uniforms.uSSREnabled) rendercraftMaterial.uniforms.uSSREnabled.value = originalSsr.enabled;
                    if (rendercraftMaterial.uniforms.uSSRIntensity) rendercraftMaterial.uniforms.uSSRIntensity.value = originalSsr.intensity;
                    root.ShaderEngine?.updateAllUniforms?.('test_lab_isolation_ssr_restore');
                }
                if (originalMode && getMode() !== originalMode) {
                    await switchMode(originalMode, this.config, null);
                }
            }
        }

        async runStudioScenarios() {
            if (!root.StudioRender?.render) {
                this.addSkip('40.studio.smoke', 'Studio Render smoke', 'studio_api_unavailable');
                return;
            }
            const original = root.StudioRender.settings || {};
            const originalAo = root.LightflowAmbientOcclusion?.settings
                ? cloneJson(
                    root.LightflowAmbientOcclusion.settings,
                    { ...root.LightflowAmbientOcclusion.settings }
                )
                : null;
            const originalMode = getMode();
            const originalOverrides = this.config.studioModeMatrix
                ? snapshotOverrideState()
                : null;
            const hadOverrides = !!safe(
                () => root.ShaderEngine?.projectHasMaterialOverrides?.(),
                false
            );
            let studioOverridesCleared = false;
            let studioAoQualityOverridden = false;
            try {
            let studioDeviceUnhealthy = false;
            let studioDeviceFailureReason = '';
            const markStudioDeviceHealth = scenario => {
                if (!scenario) return;
                const diagnostics = scenario.studioDiagnostics || {};
                const contextLost =
                    scenario.contextEvents?.some?.(event => event.type === 'lost') ||
                    diagnostics.contextLost === true ||
                    Number(diagnostics.contextLossCount || 0) > 0 ||
                    scenario.errors?.some?.(error => /context.*lost|WebGL context.*lost/i.test(JSON.stringify(error)));
                if (contextLost) {
                    studioDeviceUnhealthy = true;
                    studioDeviceFailureReason = `studio_context_lost:${scenario.id}`;
                    this.report.events.push({
                        type: 'studio_quarantine',
                        at: wallIso(),
                        scenarioId: scenario.id,
                        reason: studioDeviceFailureReason
                    });
                }
            };
            const renderStudio = async (
                id,
                label,
                resolution,
                mode,
                fixture = 'current',
                renderOptions = {}
            ) => {
                if (studioDeviceUnhealthy) {
                    this.addSkip(id, label, studioDeviceFailureReason || 'studio_device_unhealthy');
                    return null;
                }
                const result = await this.scenario(id, label, async scenario => {
                    scenario.mode = mode || getMode();
                    scenario.fixture = fixture;
                    const settings = {
                        ...original,
                        resolution_preset: 'custom',
                        resolution: resolution.slice(),
                        output_scale: 1,
                        samples: String(this.config.studioSamples),
                        tile_size: 'auto',
                        capture_area: 'full',
                        destination: 'preview',
                        file_name: `lightflow_test_${mode || getMode()}_${resolution[0]}x${resolution[1]}`,
                        ...(renderOptions.settings || {})
                    };
                    scenario.studioSettings = toSerializable(settings);
                    if (renderOptions.verifyPostQuality === true) {
                        scenario.studioQualityRequest = toSerializable(
                            renderOptions.qualityExpectations || {}
                        );
                    }
                    if (renderOptions.benchmarkCase) {
                        scenario.studioPostBenchmarkCase = toSerializable(renderOptions.benchmarkCase);
                    }
                    const telemetryStop = { value: false };
                    const telemetryPromise = (async () => {
                        const telemetryStarted = now();
                        while (!telemetryStop.value) {
                            this.sampleTelemetry(scenario, now() - telemetryStarted, true);
                            await sleep(this.config.telemetryIntervalMs);
                        }
                    })();
                    const started = now();
                    try {
                        const studioResult = await root.StudioRender.render(settings, { save: false, deliver: false, silent: true });
                        scenario.studioResult = toSerializable(studioResult);
                        scenario.studioDiagnostics = toSerializable(root.LightflowStudioRenderDiagnostics);
                        if (studioResult && studioResult.ok === false) {
                            throw new Error(`Studio diagnostic render failed: ${studioResult.error || 'unknown error'}`);
                        }
                        if (renderOptions.verifyPostQuality === true) {
                            scenario.studioPostQualityContract = evaluateStudioPostQualityContract(
                                scenario.studioDiagnostics,
                                renderOptions.qualityExpectations || {}
                            );
                            if (!scenario.studioPostQualityContract.passed) {
                                scenario.status = 'failed';
                                scenario.errors.push({
                                    type: 'studio_post_quality_contract_failed',
                                    contract: scenario.studioPostQualityContract
                                });
                            }
                        }
                        scenario.studioWallMs = round(now() - started);
                    } finally {
                        // Studio failures throw before the success path completes.
                        // Preserve the final renderer/context diagnostics either way.
                        scenario.studioDiagnostics = toSerializable(root.LightflowStudioRenderDiagnostics);
                        telemetryStop.value = true;
                        await telemetryPromise;
                    }
                    await frames(2);
                }, { measureRaf: false });
                markStudioDeviceHealth(result);
                return result;
            };

            if (this.config.studioModeMatrix && hadOverrides) {
                await this.scenario(
                    '38.studio.fixture.global.prepare',
                    'Studio: prepare true global-mode fixture',
                    async scenario => {
                        scenario.hadOverrides = true;
                        clearOverrides(originalOverrides);
                        studioOverridesCleared = true;
                        await frames(2);
                        scenario.hasOverridesAfterClear = !!safe(
                            () => root.ShaderEngine?.projectHasMaterialOverrides?.(),
                            false
                        );
                        await this.measureIdle(scenario, this.config.settleDurationMs);
                    }
                );
            }

            const matrixFixture = studioOverridesCleared
                ? 'global_no_overrides'
                : 'current';
            const smokeModes = this.config.studioModeMatrix ? MODE_IDS : [getMode() || 'cinematic_craft'];
            if (this.config.runStudioQualityContract) {
                const qualityMode = 'lightflow';
                const aoApiAvailable = !!(
                    originalAo &&
                    root.LightflowAmbientOcclusion?.applySettings
                );
                if (!aoApiAvailable) {
                    this.addSkip(
                        '39.studio.quality_max.transition',
                        'Studio maximum AO/Bloom quality: prepare Lightflow',
                        'ao_api_unavailable'
                    );
                    this.addSkip(
                        '40.studio.quality_max.ao_bloom',
                        'Studio maximum AO/Bloom runtime contract',
                        'ao_api_unavailable'
                    );
                    if (this.config.runStudioPostBenchmark) {
                        buildStudioPostBenchmarkCases(this.config).forEach(benchmarkCase => {
                            this.addSkip(benchmarkCase.id, benchmarkCase.label, 'ao_api_unavailable');
                        });
                    }
                } else {
                    const qualityTransition = await this.scenario(
                        '39.studio.quality_max.transition',
                        'Studio maximum AO/Bloom quality: prepare Lightflow',
                        async scenario => {
                            await switchMode(qualityMode, this.config, scenario);
                            await this.measureIdle(scenario, this.config.settleDurationMs);
                        }
                    );
                    if (!qualityTransition.modeTransition?.ok) {
                        this.addSkip(
                            '40.studio.quality_max.ao_bloom',
                            'Studio maximum AO/Bloom runtime contract',
                            'mode_transition_failed:lightflow'
                        );
                        if (this.config.runStudioPostBenchmark) {
                            buildStudioPostBenchmarkCases(this.config).forEach(benchmarkCase => {
                                this.addSkip(
                                    benchmarkCase.id,
                                    benchmarkCase.label,
                                    'mode_transition_failed:lightflow'
                                );
                            });
                        }
                    } else {
                        studioAoQualityOverridden = true;
                        const applyBenchmarkAo = (enabled, cause) => {
                            root.LightflowAmbientOcclusion.applySettings(
                                { ...originalAo, enabled: enabled === true, quality: 'performance' },
                                { persist: false, refresh: true, cause }
                            );
                        };
                        try {
                            applyBenchmarkAo(true, 'test_lab_studio_quality_contract');
                            await frames(2);
                            await renderStudio(
                                '40.studio.quality_max.ao_bloom',
                                'Studio maximum AO/Bloom runtime contract',
                                this.config.studioSmokeResolution,
                                qualityMode,
                                matrixFixture,
                                {
                                    settings: {
                                        bloom_enabled: true,
                                        viewport_bloom_enabled: true,
                                        viewport_bloom_quality: 'performance'
                                    },
                                    verifyPostQuality: true,
                                    qualityExpectations: {
                                        requestedAoQuality: 'performance',
                                        requestedBloomQuality: 'performance',
                                        requireBloom: true
                                    }
                                }
                            );
                            if (this.config.runStudioPostBenchmark && !studioDeviceUnhealthy) {
                                const benchmarkCases = buildStudioPostBenchmarkCases(this.config);
                                for (const benchmarkCase of benchmarkCases) {
                                    if (studioDeviceUnhealthy) {
                                        this.addSkip(
                                            benchmarkCase.id,
                                            benchmarkCase.label,
                                            studioDeviceFailureReason || 'studio_device_unhealthy'
                                        );
                                        continue;
                                    }
                                    applyBenchmarkAo(
                                        benchmarkCase.aoEnabled,
                                        `test_lab_studio_post_benchmark_${benchmarkCase.kind}`
                                    );
                                    await frames(2);
                                    const qualityExpectations = {
                                        requireAo: benchmarkCase.aoEnabled,
                                        requireBloom: benchmarkCase.bloomEnabled
                                    };
                                    if (benchmarkCase.aoEnabled) {
                                        qualityExpectations.requestedAoQuality = 'performance';
                                    }
                                    if (benchmarkCase.bloomEnabled) {
                                        qualityExpectations.requestedBloomQuality = 'performance';
                                    }
                                    await renderStudio(
                                        benchmarkCase.id,
                                        benchmarkCase.label,
                                        benchmarkCase.resolution,
                                        qualityMode,
                                        matrixFixture,
                                        {
                                            settings: {
                                                samples: String(benchmarkCase.samples),
                                                bloom_enabled: benchmarkCase.bloomEnabled,
                                                viewport_bloom_enabled: benchmarkCase.bloomEnabled,
                                                viewport_bloom_quality: 'performance'
                                            },
                                            verifyPostQuality: benchmarkCase.verifyPostQuality,
                                            qualityExpectations,
                                            benchmarkCase
                                        }
                                    );
                                }
                            }
                        } finally {
                            root.LightflowAmbientOcclusion.applySettings(originalAo, {
                                persist: false,
                                refresh: true,
                                cause: 'test_lab_studio_quality_restore'
                            });
                            studioAoQualityOverridden = false;
                            await frames(2);
                        }
                    }
                }
            }
            for (const mode of smokeModes) {
                if (studioDeviceUnhealthy) {
                    this.addSkip(`40.studio.${mode}.smoke`, `Studio ${MODE_LABELS[mode] || mode} 512 smoke`, studioDeviceFailureReason || 'studio_device_unhealthy');
                    if ((this.config.studioHdModes || []).includes(mode)) {
                        this.addSkip(`41.studio.${mode}.hd`, `Studio ${MODE_LABELS[mode] || mode} 1080p`, studioDeviceFailureReason || 'studio_device_unhealthy');
                    }
                    continue;
                }
                const transitionScenario = await this.scenario(`39.studio.mode.${mode}.transition`, `Studio: prepare ${MODE_LABELS[mode] || mode}`, async scenario => {
                    await switchMode(mode, this.config, scenario);
                    await this.measureIdle(scenario, this.config.settleDurationMs);
                });
                if (!transitionScenario.modeTransition?.ok) {
                    this.addSkip(`40.studio.${mode}.smoke`, `Studio ${MODE_LABELS[mode] || mode} 512 smoke`, `mode_transition_failed:${mode}`);
                    if ((this.config.studioHdModes || []).includes(mode)) {
                        this.addSkip(`41.studio.${mode}.hd`, `Studio ${MODE_LABELS[mode] || mode} 1080p`, `mode_transition_failed:${mode}`);
                    }
                    continue;
                }
                await renderStudio(
                    `40.studio.${mode}.smoke`,
                    `Studio ${MODE_LABELS[mode] || mode} 512 smoke`,
                    this.config.studioSmokeResolution,
                    mode,
                    matrixFixture
                );
                if ((this.config.studioHdModes || []).includes(mode)) {
                    await renderStudio(
                        `41.studio.${mode}.hd`,
                        `Studio ${MODE_LABELS[mode] || mode} 1080p`,
                        this.config.studioHdResolution,
                        mode,
                        matrixFixture
                    );
                }
            }
            if (this.config.includeHeavyStudio) {
                const heavyMode = 'cinematic_craft';
                if (studioDeviceUnhealthy) {
                    this.addSkip(
                        '42.studio.cinematic_craft.heavy',
                        'Studio Rendercraft 4K safety/performance',
                        studioDeviceFailureReason || 'studio_device_unhealthy'
                    );
                } else {
                let heavyReady = getMode() === heavyMode;
                if (!heavyReady) {
                    const heavyTransitionScenario = await this.scenario(`39.studio.mode.${heavyMode}.heavy_transition`, 'Studio: prepare Rendercraft 4K', async scenario => {
                        await switchMode(heavyMode, this.config, scenario);
                        await this.measureIdle(scenario, this.config.settleDurationMs);
                    });
                    heavyReady = heavyTransitionScenario.modeTransition?.ok === true;
                }
                if (heavyReady) {
                    await renderStudio(
                        '42.studio.cinematic_craft.heavy',
                        'Studio Rendercraft 4K safety/performance',
                        this.config.studioHeavyResolution,
                        heavyMode,
                        matrixFixture
                    );
                    const heavyRepeatCount = this.config.studioRepeatHeavy === true
                        ? 1
                        : Math.max(0, Math.floor(Number(this.config.studioRepeatHeavy) || 0));
                    for (let repeatIndex = 0; repeatIndex < heavyRepeatCount; repeatIndex++) {
                        if (studioDeviceUnhealthy) break;
                        const scenarioNumber = 43 + repeatIndex;
                        await renderStudio(
                            `${scenarioNumber}.studio.cinematic_craft.heavy_reuse`,
                            `Studio Rendercraft 4K prepared-context reuse ${repeatIndex + 1}`,
                            this.config.studioHeavyResolution,
                            heavyMode,
                            matrixFixture
                        );
                    }
                } else {
                    this.addSkip('42.studio.cinematic_craft.heavy', 'Studio Rendercraft 4K safety/performance', 'mode_transition_failed:cinematic_craft');
                }
                }
            }
            if (originalMode && getMode() !== originalMode) {
                await this.scenario('49.studio.restore_mode', `Studio: restore ${MODE_LABELS[originalMode] || originalMode}`, async scenario => {
                    await switchMode(originalMode, this.config, scenario);
                    await this.measureIdle(scenario, this.config.settleDurationMs);
                });
            }

            if (studioOverridesCleared) {
                await this.scenario(
                    '48.studio.fixture.overrides_restored',
                    'Studio: restore project material overrides',
                    async scenario => {
                        restoreOverrides(originalOverrides);
                        studioOverridesCleared = false;
                        await frames(2);
                        scenario.hasOverrides = !!safe(
                            () => root.ShaderEngine?.projectHasMaterialOverrides?.(),
                            false
                        );
                        await this.measureIdle(scenario, this.config.settleDurationMs);
                    }
                );

                const overrideMode = originalMode || getMode() || 'cinematic_craft';
                if (studioDeviceUnhealthy) {
                    this.addSkip(
                        '48.studio.overrides.smoke',
                        `Studio project overrides (${MODE_LABELS[overrideMode] || overrideMode}) 512 smoke`,
                        studioDeviceFailureReason || 'studio_device_unhealthy'
                    );
                } else {
                    await renderStudio(
                        '48.studio.overrides.smoke',
                        `Studio project overrides (${MODE_LABELS[overrideMode] || overrideMode}) 512 smoke`,
                        this.config.studioSmokeResolution,
                        overrideMode,
                        'project_overrides'
                    );
                }
            }
            } finally {
                if (
                    studioAoQualityOverridden &&
                    originalAo &&
                    root.LightflowAmbientOcclusion?.applySettings
                ) {
                    root.LightflowAmbientOcclusion.applySettings(originalAo, {
                        persist: false,
                        refresh: true,
                        cause: 'test_lab_studio_quality_abort_restore'
                    });
                    studioAoQualityOverridden = false;
                    await frames(2);
                }
                if (studioOverridesCleared) {
                    restoreOverrides(originalOverrides);
                    studioOverridesCleared = false;
                    await frames(2);
                }
                // Diagnostic renders use save:false but StudioRender.render still
                // replaces its in-memory currentSettings. Never let Test Lab leave
                // the user's composer/render settings changed after the matrix.
                if (original && root.StudioRender?.setComposerSettings) {
                    root.StudioRender.setComposerSettings(original);
                }
                // Also restore the user's mode if the matrix aborted between a
                // transition and the normal restore scenario (context loss,
                // cancellation, or an unexpected diagnostic exception).
                if (originalMode && getMode() !== originalMode) {
                    try {
                        await switchMode(originalMode, this.config, null);
                    } catch (error) {
                        this.report.events.push({
                            type: 'studio_restore_mode_failed',
                            at: wallIso(),
                            mode: originalMode,
                            message: error?.message || String(error)
                        });
                    }
                }
            }
        }

        async waitForProjectSettled(targetProject, options = {}) {
            const startedAt = Number.isFinite(Number(options.startedAt))
                ? Number(options.startedAt)
                : now();
            const timeoutMs = clamp(
                options.timeoutMs ?? this.config.projectSwitchTimeoutMs,
                5000,
                180000
            );
            const milestones = {
                projectActiveMs: null,
                switchingFlagClearedMs: null,
                hydrationCompleteMs: null,
                warmupReadyMs: null,
                firstRenderedFrameMs: null,
                settledMs: null
            };
            let stableFrames = 0;
            let lastLifecycle = null;
            let lastDiagnostics = null;
            let lastWarmup = null;

            while (now() - startedAt < timeoutMs) {
                this.assertNotCancelled();
                const elapsed = now() - startedAt;
                const active = root.Project === targetProject;
                const switching = !!safe(() => root.Blockbench?.hasFlag?.('switching_project'), false);
                const parsed = !!targetProject?.parsed;
                lastLifecycle = toSerializable(safe(() => root.LightflowLifecycle?.snapshot?.(), null));
                lastDiagnostics = toSerializable(safe(() => root.LightflowDiagnostics?.snapshot?.(), null));
                lastWarmup = toSerializable(getWarmupState());
                const lastProfileTimestamp = Number(safe(
                    () => root.LightflowFrameProfiler?.getProfile?.(getPreview())?.timestamp,
                    NaN
                ));
                const lifecycleComplete = !!(
                    lastLifecycle &&
                    Number(lastLifecycle.generation) === Number(lastLifecycle.lastCompletedGeneration) &&
                    Number(lastLifecycle.pendingHydrators) === 0 &&
                    lastLifecycle.hydrationScheduled !== true &&
                    lastLifecycle.geometryReadyScheduled !== true
                );
                const warmupReady = lastWarmup?.state === 'READY' &&
                    Number(lastWarmup?.pending || 0) === 0 &&
                    Number(lastWarmup?.active || 0) === 0;

                if (active && milestones.projectActiveMs === null) milestones.projectActiveMs = round(elapsed);
                if (active && !switching && milestones.switchingFlagClearedMs === null) {
                    milestones.switchingFlagClearedMs = round(elapsed);
                }
                if (active && parsed && lifecycleComplete && milestones.hydrationCompleteMs === null) {
                    milestones.hydrationCompleteMs = round(elapsed);
                }
                if (
                    active &&
                    milestones.hydrationCompleteMs !== null &&
                    warmupReady &&
                    milestones.warmupReadyMs === null
                ) {
                    milestones.warmupReadyMs = round(elapsed);
                }
                if (
                    active && Number.isFinite(lastProfileTimestamp) &&
                    lastProfileTimestamp >= startedAt &&
                    milestones.firstRenderedFrameMs === null
                ) {
                    milestones.firstRenderedFrameMs = round(lastProfileTimestamp - startedAt);
                }
                const lifecycleFirstFrameValue = lastDiagnostics?.timings?.firstInteractiveFrameMs;
                const lifecycleFirstFrameMs = lifecycleFirstFrameValue === null ||
                    lifecycleFirstFrameValue === undefined
                    ? NaN
                    : Number(lifecycleFirstFrameValue);
                const lifecycleStartedAt = Number(lastDiagnostics?.timings?.projectStartedAt);
                if (
                    active && Number.isFinite(lifecycleFirstFrameMs) && lifecycleFirstFrameMs >= 0 &&
                    milestones.firstRenderedFrameMs === null
                ) {
                    milestones.firstRenderedFrameMs = round(
                        Number.isFinite(lifecycleStartedAt)
                            ? Math.max(0, lifecycleStartedAt + lifecycleFirstFrameMs - startedAt)
                            : lifecycleFirstFrameMs
                    );
                }

                const settled = active && parsed && !switching && lifecycleComplete && warmupReady &&
                    milestones.firstRenderedFrameMs !== null;
                stableFrames = settled ? stableFrames + 1 : 0;
                if (stableFrames >= 2) {
                    milestones.settledMs = round(elapsed);
                    return {
                        ok: true,
                        timedOut: false,
                        projectId: targetProject?.uuid || targetProject?.id || null,
                        projectName: targetProject?.name || null,
                        milestones,
                        lifecycle: lastLifecycle,
                        shaderTimings: lastDiagnostics?.timings || null,
                        performance: lastDiagnostics?.performance || null,
                        warmup: lastWarmup
                    };
                }
                // Project selection can temporarily suspend the host RAF while
                // lifecycle work continues on timers. Keep polling so a suspended
                // RAF is measured as a rendering milestone, not mistaken for a
                // 25-second lifecycle stall.
                await Promise.race([nextFrame(), sleep(50)]);
            }

            return {
                ok: false,
                timedOut: true,
                projectId: targetProject?.uuid || targetProject?.id || null,
                projectName: targetProject?.name || null,
                milestones,
                lifecycle: lastLifecycle,
                shaderTimings: lastDiagnostics?.timings || null,
                performance: lastDiagnostics?.performance || null,
                warmup: lastWarmup
            };
        }

        async runProjectSwitchingScenario() {
            await this.scenario('60.project.switching', 'Existing-project switching and rapid supersession', async scenario => {
                const projects = Array.isArray(root.ModelProject?.all)
                    ? root.ModelProject.all.filter(project => project && typeof project.select === 'function')
                    : [];
                const originalProject = root.Project || null;
                if (!originalProject || projects.length < 2) {
                    scenario.status = 'skipped';
                    scenario.reason = 'requires_two_open_projects';
                    scenario.openProjectCount = projects.length;
                    return;
                }

                const candidates = projects.slice(0, 3);
                if (!candidates.includes(originalProject)) candidates[candidates.length - 1] = originalProject;
                const orderedTargets = candidates.filter(project => project !== originalProject);
                orderedTargets.push(originalProject);
                scenario.openProjects = candidates.map(project => ({
                    id: project?.uuid || project?.id || null,
                    name: project?.name || null,
                    format: project?.format?.id || project?.format?.name || null,
                    parsed: !!project?.parsed,
                    saved: project?.saved
                }));
                scenario.settledSwitches = [];
                scenario.rapidSwitches = [];
                const originalResourceReuse = root.ShaderEngine?.projectResourceReuseEnabled === true;
                const resourceReuseModes = Array.isArray(this.config.projectSwitchResourceReuseModes) &&
                    this.config.projectSwitchResourceReuseModes.length
                    ? this.config.projectSwitchResourceReuseModes.map(value => value === true)
                    : [originalResourceReuse];

                const selectAndMeasure = async (project, kind, iteration, resourceReuse) => {
                    const selectStartedAt = now();
                    project.select();
                    const selectCallMs = round(now() - selectStartedAt);
                    const result = await this.waitForProjectSettled(project, { startedAt: selectStartedAt });
                    const record = {
                        kind,
                        iteration,
                        resourceReuse,
                        selectCallMs,
                        ...toSerializable(result)
                    };
                    if (!result.ok) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'project_switch_timeout',
                            kind,
                            iteration,
                            projectId: result.projectId,
                            milestones: result.milestones
                        });
                    }
                    return record;
                };

                try {
                    for (const resourceReuse of resourceReuseModes) {
                        root.ShaderEngine?.setProjectResourceReuseEnabled?.(resourceReuse);
                        for (let iteration = 0; iteration < this.config.projectSwitchIterations; iteration++) {
                            for (const project of orderedTargets) {
                                scenario.settledSwitches.push(await selectAndMeasure(
                                    project,
                                    'settled',
                                    iteration,
                                    resourceReuse
                                ));
                            }
                        }

                        const rapidTargets = orderedTargets.filter(project => project !== root.Project);
                        if (rapidTargets.length) {
                            const burstStartedAt = now();
                            rapidTargets.forEach(project => project.select());
                            originalProject.select();
                            const dispatchMs = round(now() - burstStartedAt);
                            const result = await this.waitForProjectSettled(originalProject, {
                                startedAt: burstStartedAt
                            });
                            scenario.rapidSwitches.push({
                                kind: 'superseded_burst',
                                resourceReuse,
                                requests: rapidTargets.length + 1,
                                dispatchMs,
                                ...toSerializable(result)
                            });
                            if (!result.ok) {
                                scenario.status = 'failed';
                                scenario.errors.push({ type: 'rapid_project_switch_timeout' });
                            }
                        }
                    }
                } finally {
                    if (root.Project !== originalProject && typeof originalProject.select === 'function') {
                        const restoreStartedAt = now();
                        originalProject.select();
                        scenario.restore = toSerializable(await this.waitForProjectSettled(originalProject, {
                            startedAt: restoreStartedAt
                        }));
                    }
                    root.ShaderEngine?.setProjectResourceReuseEnabled?.(originalResourceReuse);
                }
            });
        }

        async runAnimationDiagnosticsMatrix() {
            const modes = this.config.animationModeIds?.length
                ? this.config.animationModeIds
                : MODE_IDS;
            const shadowStates = this.config.animationShadowStates?.length
                ? this.config.animationShadowStates
                : ['current'];
            const originalMode = getMode();
            const originalLights = captureLightState();
            const lightElements = originalLights.map(record => record.element).filter(Boolean);

            const applyShadowState = state => {
                restoreLightState(originalLights);
                if (state === 'current') return;
                lightElements.forEach(light => { light.has_shadow = state === 'on'; });
                notifyLightsChanged(lightElements, { shadows: true, scene: true });
                if (root.Project && originalLights.length && typeof originalLights[0].saved === 'boolean') {
                    root.Project.saved = originalLights[0].saved;
                }
            };

            try {
                for (const mode of modes) {
                    let modeAvailable = true;
                    await this.scenario(
                        `50.animation.${mode}.idle`,
                        `Animation matrix: ${MODE_LABELS[mode] || mode} idle`,
                        async scenario => {
                            const transition = await switchMode(mode, this.config, scenario);
                            modeAvailable = transition.ok;
                            if (!transition.ok) {
                                scenario.reason = transition.reason || 'mode_transition_failed';
                                if (scenario.status === 'running') {
                                    scenario.status = 'failed';
                                    scenario.errors.push({ type: 'animation_mode_transition_failed', mode, transition });
                                }
                                return;
                            }
                            scenario.mode = mode;
                            applyShadowState('current');
                            await frames(2);
                            const preview = getPreview();
                            safe(() => root.LightflowFrameProfiler?.resetHistory?.(preview), false);
                            await this.measureIdle(scenario, this.config.animationDurationMs);
                            scenario.shadowState = 'current';
                            scenario.framePacing = summarizeFramePacing(scenario.frameDeltasMs);
                            scenario.profilerStatistics = toSerializable(
                                safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null)
                            );
                        }
                    );

                    for (const shadowState of shadowStates) {
                        await this.scenario(
                            `50.animation.${mode}.${shadowState}`,
                            `Animation matrix: ${MODE_LABELS[mode] || mode}, shadows ${shadowState}`,
                            async scenario => {
                                scenario.shadowState = shadowState;
                                scenario.lightCount = lightElements.length;
                                if (!modeAvailable) {
                                    scenario.status = 'skipped';
                                    scenario.reason = 'mode_unavailable';
                                    return;
                                }
                                if (shadowState !== 'current' && !lightElements.length) {
                                    scenario.status = 'skipped';
                                    scenario.reason = 'no_lights_for_shadow_comparison';
                                    return;
                                }
                                applyShadowState(shadowState);
                                const warmup = await waitForWarmupStable(this.config);
                                scenario.shadowWarmup = toSerializable(warmup);
                                if (!warmup.ok) {
                                    scenario.status = 'failed';
                                    scenario.errors.push({ type: 'animation_shadow_warmup_failed', shadowState });
                                    return;
                                }
                                await frames(2);
                                await this.measureAnimationPlayback(scenario);
                            }
                        );
                    }
                }
            } finally {
                restoreLightState(originalLights);
                if (originalMode && getMode() !== originalMode) {
                    await switchMode(originalMode, this.config, null);
                }
            }
        }

        async runAnimationFeatureIsolationScenarios() {
            const graph = safe(() => root.LightflowRenderer?.describeGraph?.(), null);
            const available = new Set((graph?.registeredPasses || []).map(pass => pass.id));
            const candidates = [
                { passId: 'ao', label: 'Ambient Occlusion', mode: 'lightflow' },
                { passId: 'atmosphere', label: 'Atmosphere', mode: 'lightflow' },
                { passId: 'ssr_resolve', label: 'SSR Resolve', mode: 'cinematic_craft' },
                { passId: 'rendercraft_rim', label: 'Rendercraft Rim', mode: 'cinematic_craft' },
                { passId: 'viewport_composer', label: 'Viewport Composer / Bloom', mode: 'cinematic_craft' }
            ];
            const originalMode = getMode();
            const originalAo = root.LightflowAmbientOcclusion?.settings
                ? cloneJson(root.LightflowAmbientOcclusion.settings, { ...root.LightflowAmbientOcclusion.settings })
                : null;
            const originalStudio = root.StudioRender?.settings
                ? cloneJson(root.StudioRender.settings, root.StudioRender.settings)
                : null;
            const rendercraftMaterial = root.MaterialManager?.materials?.cinematic_craft || null;
            const originalSsr = rendercraftMaterial?.uniforms ? {
                enabled: rendercraftMaterial.uniforms.uSSREnabled?.value,
                intensity: rendercraftMaterial.uniforms.uSSRIntensity?.value
            } : null;

            try {
                for (const candidate of candidates) {
                    const { passId, label, mode } = candidate;
                    if (!available.has(passId) || !root.LightflowPerformanceIsolation?.set) {
                        this.addSkip(`51.animation.isolation.${passId}.on`, `${label} animation ON`, 'pass_unavailable');
                        this.addSkip(`51.animation.isolation.${passId}.off`, `${label} animation OFF`, 'pass_unavailable');
                        continue;
                    }
                    if (getMode() !== mode) {
                        const transition = await switchMode(mode, this.config, null);
                        if (!transition.ok) {
                            this.addSkip(`51.animation.isolation.${passId}.on`, `${label} animation ON`, `mode_transition_failed:${mode}`);
                            this.addSkip(`51.animation.isolation.${passId}.off`, `${label} animation OFF`, `mode_transition_failed:${mode}`);
                            continue;
                        }
                    }
                    if (passId === 'ao' && originalAo && root.LightflowAmbientOcclusion?.applySettings) {
                        root.LightflowAmbientOcclusion.applySettings(
                            { ...originalAo, enabled: true },
                            { persist: false, refresh: true, cause: 'test_lab_animation_isolation_ao' }
                        );
                    }
                    if (passId === 'viewport_composer' && root.StudioRender?.setComposerSettings) {
                        root.StudioRender.setComposerSettings({ viewport_bloom_enabled: true });
                    }
                    if (passId === 'ssr_resolve' && rendercraftMaterial?.uniforms) {
                        if (rendercraftMaterial.uniforms.uSSREnabled) rendercraftMaterial.uniforms.uSSREnabled.value = true;
                        if (rendercraftMaterial.uniforms.uSSRIntensity) {
                            rendercraftMaterial.uniforms.uSSRIntensity.value = Math.max(
                                0.55,
                                Number(rendercraftMaterial.uniforms.uSSRIntensity.value) || 0
                            );
                        }
                        root.ShaderEngine?.updateAllUniforms?.('test_lab_animation_isolation_ssr');
                    }
                    await frames(3);

                    for (const enabled of [true, false]) {
                        await this.scenario(
                            `51.animation.isolation.${passId}.${enabled ? 'on' : 'off'}`,
                            `${label} animation ${enabled ? 'ON' : 'OFF'}`,
                            async scenario => {
                                scenario.mode = mode;
                                scenario.animationIsolation = { passId, label, mode, enabled };
                                root.LightflowPerformanceIsolation.set(passId, enabled);
                                await frames(2);
                                await this.measureAnimationPlayback(
                                    scenario,
                                    this.config.animationIsolationDurationMs
                                );
                            }
                        );
                    }
                    root.LightflowPerformanceIsolation.set(passId, true);
                }
            } finally {
                root.LightflowPerformanceIsolation?.reset?.();
                if (originalAo && root.LightflowAmbientOcclusion?.applySettings) {
                    root.LightflowAmbientOcclusion.applySettings(originalAo, {
                        persist: false,
                        refresh: true,
                        cause: 'test_lab_animation_isolation_ao_restore'
                    });
                }
                if (originalStudio && root.StudioRender?.setComposerSettings) {
                    root.StudioRender.setComposerSettings(originalStudio);
                }
                if (originalSsr && rendercraftMaterial?.uniforms) {
                    if (rendercraftMaterial.uniforms.uSSREnabled) rendercraftMaterial.uniforms.uSSREnabled.value = originalSsr.enabled;
                    if (rendercraftMaterial.uniforms.uSSRIntensity) rendercraftMaterial.uniforms.uSSRIntensity.value = originalSsr.intensity;
                    root.ShaderEngine?.updateAllUniforms?.('test_lab_animation_isolation_ssr_restore');
                }
                if (originalMode && getMode() !== originalMode) {
                    await switchMode(originalMode, this.config, null);
                }
            }
        }

        async runLightTopologyStressScenario(id = '73.stress.light_topology') {
            await this.scenario(id, 'Many-light topology and shadow stress', async scenario => {
                const LightClass = root.LightElement;
                if (typeof LightClass !== 'function') {
                    scenario.status = 'skipped';
                    scenario.reason = 'light_class_unavailable';
                    return;
                }
                const created = [];
                const saved = root.Project?.saved;
                try {
                    for (let index = 0; index < this.config.stressLightCount; index++) {
                        const angle = index / Math.max(1, this.config.stressLightCount) * Math.PI * 2;
                        const light = new LightClass({
                            name: `__lightflow_test_stress_light_${index}__`,
                            light_type: index % 5 === 0 ? 'spot' : 'point',
                            position: [Math.cos(angle) * 24, 8 + (index % 4) * 4, Math.sin(angle) * 24],
                            color: [160 + (index * 37) % 95, 160 + (index * 53) % 95, 160 + (index * 71) % 95],
                            intensity: 0.7 + (index % 3) * 0.25,
                            distance: 64,
                            has_shadow: index < Math.min(4, this.config.stressLightCount),
                            shadow_resolution: 256,
                            studio_shadow_resolution: 0
                        });
                        if (typeof light.addTo === 'function') light.addTo(safe(() => root.getCurrentGroup?.(), null));
                        if (typeof light.init === 'function') light.init();
                        created.push(light);
                        root.Blockbench?.dispatchEvent?.('add_light', { object: light, source: 'lightflow_test_lab_stress' });
                    }
                    notifyLightsChanged(created, { shadows: true, scene: true });
                    checkpointWebGLErrors(scenario, 'stress_lights.after_create_notify', {
                        lightCount: created.length
                    });
                    scenario.createdLights = created.map(light => ({ uuid: light.uuid || null, type: light.light_type, shadow: light.has_shadow !== false }));
                    scenario.warmup = await waitForWarmupStable(this.config, milestone => scenario.milestones.push(milestone));
                    checkpointWebGLErrors(scenario, 'stress_lights.after_warmup', {
                        lightCount: created.length
                    });
                    if (!scenario.warmup.ok) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: scenario.warmup.stalled
                                ? 'stress_light_scheduler_stall'
                                : 'stress_light_warmup_failed',
                            warmup: toSerializable(scenario.warmup)
                        });
                        if (this.config.suite === 'shader_compilation') return;
                    }
                    const lightPerformance = safe(() => (
                        root.LightflowDiagnostics?.snapshot?.()?.performance?.lightingScalability
                    ), null);
                    scenario.lightingScalability = toSerializable(lightPerformance);
                    const expectedPackedLights = Math.min(16, created.length);
                    if (
                        Number(lightPerformance?.effectiveLightCount) < expectedPackedLights ||
                        Number(lightPerformance?.programLightSlotMismatchCount) > 0
                    ) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'stress_light_program_slot_coverage_failed',
                            expectedPackedLights,
                            effectiveLightCount: Number(lightPerformance?.effectiveLightCount) || 0,
                            requiredProgramLightSlots: Number(lightPerformance?.requiredProgramLightSlots) || 0,
                            compiledProgramLightSlots: lightPerformance?.compiledProgramLightSlots || [],
                            mismatchCount: Number(lightPerformance?.programLightSlotMismatchCount) || 0
                        });
                    }
                    await this.measureIdle(scenario, Math.min(this.config.stressDurationMs, 8000));
                    checkpointWebGLErrors(scenario, 'stress_lights.after_idle_render', {
                        lightCount: created.length
                    });
                } finally {
                    // Preserve the failed 65-second measurement, but let its
                    // outstanding driver job finish before changing topology.
                    if (this.config.suite === 'shader_compilation' && !scenario.warmup?.ok) {
                        scenario.compilationDrain = await waitForWarmupStable({
                            ...this.config, warmupTimeoutMs: 180000
                        });
                        if (!scenario.compilationDrain.ok) this.compilationDiagnosticsBlocked = true;
                    }
                    created.forEach(light => {
                        safe(() => light.remove?.(), null);
                        safe(() => root.Blockbench?.dispatchEvent?.('remove_light', { object: light, source: 'lightflow_test_lab_stress' }), null);
                    });
                    checkpointWebGLErrors(scenario, 'stress_lights.after_remove_events', {
                        lightCount: created.length
                    });
                    safe(() => root.update_light_element_callback?.({
                        elements: created, cleanup: true, immediate: true, shadows: true, scene: true, gizmos: false
                    }), null);
                    checkpointWebGLErrors(scenario, 'stress_lights.after_cleanup_callback', {
                        lightCount: created.length
                    });
                    if (root.three_lights) {
                        const remaining = created.filter(light => light.uuid && root.three_lights[light.uuid])
                            .map(light => light.uuid);
                        scenario.lightRegistryCleanup = { remainingCreatedLights: remaining };
                        if (remaining.length) {
                            scenario.status = 'failed';
                            scenario.errors.push({ type: 'removed_lights_still_registered', uuids: remaining });
                            this.compilationDiagnosticsBlocked = true;
                        }
                    }
                    await frames(3);
                    checkpointWebGLErrors(scenario, 'stress_lights.after_cleanup_frames', {
                        lightCount: created.length
                    });
                    if (root.Project && typeof saved === 'boolean') root.Project.saved = saved;
                    if (this.config.suite === 'shader_compilation' && !this.compilationDiagnosticsBlocked) {
                        scenario.cleanupWarmup = await waitForWarmupStable({
                            ...this.config, warmupTimeoutMs: 180000
                        });
                        if (!scenario.cleanupWarmup.ok) {
                            this.compilationDiagnosticsBlocked = true;
                            scenario.status = 'failed';
                            scenario.errors.push({ type: 'light_cleanup_warmup_failed', warmup: toSerializable(scenario.cleanupWarmup) });
                        }
                    }
                }
            });
        }

        async runStressScenarios() {
            const sceneOnly = this.config.stressSceneOnly === true;
            if (!sceneOnly) {
            await this.scenario('70.stress.baseline', 'Stress resource baseline', async scenario => {
                await this.measureIdle(scenario, Math.max(this.config.settleDurationMs, 1000));
                this.resourceBaseline = getArchitectureSnapshot();
                scenario.resourceBaseline = toSerializable(this.resourceBaseline);
            });

            await this.scenario('71.stress.mode_thrash', 'Rapid render-mode transition storm', async scenario => {
                if (!root.ShaderEngine?.requestGlobalRenderModeChange) {
                    scenario.status = 'skipped';
                    scenario.reason = 'mode_change_api_unavailable';
                    return;
                }
                const originalMode = getMode();
                scenario.expectedDurationMs = Math.max(1000, this.config.stressIterations * 80);
                scenario.transitions = [];
                try {
                    for (let index = 0; index < this.config.stressIterations; index++) {
                        this.assertNotCancelled();
                        const requestedMode = MODE_IDS[index % MODE_IDS.length];
                        const started = now();
                        const accepted = root.ShaderEngine.requestGlobalRenderModeChange(requestedMode);
                        scenario.transitions.push({
                            index,
                            requestedMode,
                            accepted: accepted !== false,
                            modeImmediatelyAfter: getMode(),
                            requestMs: round(now() - started)
                        });
                        await frames(index % 3 === 0 ? 2 : 1);
                        this.sampleTelemetry(scenario, (index + 1) / this.config.stressIterations * scenario.expectedDurationMs, true);
                    }
                    const finalMode = MODE_IDS[(this.config.stressIterations - 1) % MODE_IDS.length];
                    const stabilization = await switchMode(finalMode, this.config, null);
                    scenario.finalRequestedMode = finalMode;
                    scenario.finalCommittedMode = getMode();
                    scenario.stabilization = toSerializable(stabilization);
                    scenario.warmup = stabilization.warmup || null;
                    scenario.milestones.push(...(stabilization.milestones || []));
                    if (!stabilization.ok || getMode() !== finalMode) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'mode_thrash_did_not_stabilize',
                            requested: finalMode,
                            actual: getMode(),
                            warmup: toSerializable(scenario.warmup)
                        });
                    }
                } finally {
                    if (originalMode && getMode() !== originalMode) await switchMode(originalMode, this.config, null);
                    await frames(2);
                    this.programBaselineAfterModeStress = getArchitectureSnapshot();
                }
            });

            await this.scenario('72.stress.transform_storm', 'High-frequency cube transform storm', async scenario => {
                const cube = root.Cube?.selected?.[0] || root.Cube?.all?.find?.(item => item?.visibility !== false);
                if (!cube) {
                    scenario.status = 'skipped';
                    scenario.reason = 'no_cube';
                    return;
                }
                const state = captureCubeState(cube);
                if (!state.from || !state.to) throw new Error('Stress cube does not expose from/to coordinates.');
                const duration = this.config.stressDurationMs;
                const sampler = new FrameSampler(duration);
                scenario.expectedDurationMs = duration;
                scenario.element = { uuid: cube.uuid || null, name: cube.name || null };
                try {
                    scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                        const phase = elapsed / 1000;
                        const x = Math.sin(phase * 17) * this.config.editTransformDistance;
                        const y = Math.cos(phase * 11) * this.config.editTransformDistance * 0.35;
                        cube.from[0] = state.from[0] + x;
                        cube.to[0] = state.to[0] + x;
                        cube.from[1] = state.from[1] + y;
                        cube.to[1] = state.to[1] + y;
                        const operationStarted = now();
                        updateElementTransform(cube, 'stress_move');
                        (scenario.operationTimings.transformUpdateMs ||= []).push(now() - operationStarted);
                        this.sampleTelemetry(scenario, elapsed);
                    });
                    scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
                    scenario.operationTimings.transformUpdate = summarizeFrameDeltas(
                        scenario.operationTimings.transformUpdateMs || [],
                        (scenario.operationTimings.transformUpdateMs || []).reduce((sum, value) => sum + value, 0)
                    );
                } finally {
                    restoreCubeState(cube, state);
                }
            });

            await this.runLightTopologyStressScenario();

            await this.scenario('74.stress.feature_churn', 'AO, SSR, atmosphere, rim and Bloom churn', async scenario => {
                const isolation = root.LightflowPerformanceIsolation;
                if (!isolation?.set) {
                    scenario.status = 'skipped';
                    scenario.reason = 'performance_isolation_api_unavailable';
                    return;
                }
                const graph = safe(() => root.LightflowRenderer?.describeGraph?.(), null);
                const available = new Set((graph?.registeredPasses || []).map(pass => pass.id));
                const passes = ['ao', 'ssr_resolve', 'atmosphere', 'rendercraft_rim', 'viewport_composer'].filter(pass => available.has(pass));
                if (!passes.length) {
                    scenario.status = 'skipped';
                    scenario.reason = 'no_isolatable_passes';
                    return;
                }
                scenario.expectedDurationMs = Math.max(1000, this.config.stressIterations * 100);
                scenario.passMutations = [];
                try {
                    for (let index = 0; index < this.config.stressIterations; index++) {
                        for (const pass of passes) {
                            const enabled = (index + passes.indexOf(pass)) % 2 === 0;
                            isolation.set(pass, enabled);
                            scenario.passMutations.push({ index, pass, enabled });
                        }
                        safe(() => getPreview()?.render?.(), null);
                        await frames(2);
                        this.sampleTelemetry(scenario, (index + 1) / this.config.stressIterations * scenario.expectedDurationMs, true);
                    }
                    passes.forEach(pass => isolation.set(pass, true));
                    await this.measureIdle(scenario, Math.min(3000, this.config.stressDurationMs));
                } finally {
                    isolation.reset?.();
                }
            });
            }

            await this.scenario('75.stress.scene_scalability', 'Temporary large-cube scene scalability', async scenario => {
                if (typeof root.Cube !== 'function') {
                    scenario.status = 'skipped';
                    scenario.reason = 'cube_class_unavailable';
                    return;
                }
                const created = [];
                const saved = root.Project?.saved;
                const parent = safe(() => root.getCurrentGroup?.(), null);
                const originalMode = getMode();
                const requestedModes = Array.isArray(this.config.stressSceneModes) && this.config.stressSceneModes.length
                    ? this.config.stressSceneModes.slice()
                    : [originalMode].filter(Boolean);
                const originalBatchCellSize = Number(root.ShaderEngine?.renderBatchSpatialCellSize) || 96;
                const originalHideSuppressedSources = !!root.ShaderEngine?.renderBatchHideSuppressedSources;
                const requestedBatchCellSizes = Array.isArray(this.config.stressBatchCellSizes) && this.config.stressBatchCellSizes.length
                    ? this.config.stressBatchCellSizes.slice()
                    : [originalBatchCellSize];
                const requestedSourceVisibilityModes = Array.isArray(this.config.stressBatchSourceVisibilityModes) &&
                    this.config.stressBatchSourceVisibilityModes.length
                    ? this.config.stressBatchSourceVisibilityModes.slice()
                    : [originalHideSuppressedSources];
                scenario.sceneModes = requestedModes.slice();
                scenario.batchCellSizes = requestedBatchCellSizes.slice();
                scenario.hideSuppressedSourceModes = requestedSourceVisibilityModes.slice();
                const warmupHistoryStart = safe(() => (
                    root.LightflowDiagnostics?.snapshot?.()?.shaderWarmup?.taskTimingHistory?.length
                ), 0) || 0;
                try {
                    const side = Math.max(1, Math.ceil(Math.sqrt(this.config.stressCubeCount)));
                    const checkpoints = Array.isArray(this.config.stressCubeCheckpoints) && this.config.stressCubeCheckpoints.length
                        ? this.config.stressCubeCheckpoints.slice()
                        : Array.from(new Set([
                            Math.min(100, this.config.stressCubeCount),
                            Math.min(500, this.config.stressCubeCount),
                            this.config.stressCubeCount
                        ].filter(count => count > 0))).sort((left, right) => left - right);
                    scenario.drawScaling = [];
                    for (const checkpoint of checkpoints) {
                        const buildStarted = now();
                        const checkpointStart = created.length;
                        for (let index = created.length; index < checkpoint; index++) {
                            const x = (index % side) * 1.25;
                            const z = Math.floor(index / side) * 1.25;
                            const cube = new root.Cube({
                                name: `__lightflow_test_stress_cube_${index}__`,
                                from: [x, 0, z], to: [x + 1, 1 + (index % 5) * 0.2, z + 1],
                                autouv: 0, box_uv: false
                            }).init().addTo(parent);
                            created.push(cube);
                        }
                        const added = created.slice(checkpointStart);
                        safe(() => root.ShaderEngine?.updateCubes?.(added, 'test_lab_stress_scene'), null);
                        safe(() => root.Canvas?.updateView?.({ elements: added, element_aspects: { geometry: true, faces: true } }), null);
                        const buildCpuMs = round(now() - buildStarted);
                        await frames(4);
                        const checkpointWarmup = await waitForWarmupStable(
                            this.config,
                            milestone => scenario.milestones.push({ ...milestone, checkpoint })
                        );
                        if (!checkpointWarmup.ok) {
                            scenario.status = 'failed';
                            scenario.errors.push({
                                type: 'stress_scene_checkpoint_warmup_failed',
                                checkpoint,
                                warmup: toSerializable(checkpointWarmup)
                            });
                        }
                        const buildMs = round(now() - buildStarted);
                        for (const batchCellSize of requestedBatchCellSizes) {
                        for (const hideSuppressedSources of requestedSourceVisibilityModes) {
                            const batchRebuildStarted = now();
                            if (root.ShaderEngine) {
                                root.ShaderEngine.renderBatchSpatialCellSize = batchCellSize;
                                root.ShaderEngine.renderBatchHideSuppressedSources = hideSuppressedSources;
                                safe(() => root.ShaderEngine.rebuildRenderBatches?.(), false);
                                safe(() => root.ShaderEngine.requestPreviewRender?.({
                                    cause: 'test_lab_batch_cell_size'
                                }), null);
                            }
                            const batchRebuildCpuMs = round(now() - batchRebuildStarted);
                            await frames(4);
                            const batchRebuildMs = round(now() - batchRebuildStarted);
                        for (const mode of requestedModes) {
                            this.assertNotCancelled();
                            const modeTransition = getMode() === mode
                                ? { ok: true, modeCommitted: true, before: mode, after: mode, transitionMs: 0 }
                                : await switchMode(mode, this.config, null);
                            if (!modeTransition.ok || getMode() !== mode) {
                                scenario.status = 'failed';
                                scenario.errors.push({
                                    type: 'stress_scene_mode_transition_failed',
                                    checkpoint,
                                    requested: mode,
                                    actual: getMode(),
                                    transition: toSerializable(modeTransition)
                                });
                                continue;
                            }
                            await frames(3);
                            safe(() => root.LightflowFrameProfiler?.resetHistory?.(
                                getPreview(),
                                { discardPending: true }
                            ), false);
                            await this.measureIdle(scenario, Math.min(1800, this.config.scenarioDurationMs));
                            const gpuDrain = await waitForProfilerGpuResults(getPreview(), {
                                timeoutMs: this.config.gpuDrainTimeoutMs,
                                minimumSamples: this.config.profilerMode === 'normal' ? 4 : 3
                            });
                            const checkpointSnapshot = getArchitectureSnapshot();
                            const limiter = toSerializable(
                                checkpointSnapshot?.diagnostics?.performanceLimiter || null
                            );
                            const performance = toSerializable(pickSerializableFields(
                                checkpointSnapshot?.diagnostics?.performance,
                                [
                                    'activeSceneBatches', 'estimatedSceneDrawsPerFrame',
                                    'rendererCallsLastFrame', 'rendererTrianglesLastFrame',
                                    'logicalFrameCpuMs', 'logicalFrameGpuMs',
                                    'logicalFrameTargetSwitches', 'logicalFrameStatistics',
                                    'renderBatches', 'renderBatchMembers', 'renderBatchSourceDraws',
                                    'savedRenderDraws', 'dynamicInstanceBatches', 'dynamicInstances',
                                    'dynamicInstanceSourceDraws', 'savedDynamicInstanceDraws',
                                    'batchingDiagnostics', 'sceneScalability', 'lightingScalability',
                                    'renderBatchGeometryCache', 'renderBatchGeometryCacheBytes',
                                    'renderBatchGeometryCacheHits', 'renderBatchGeometryCacheMisses',
                                    'frameBudget'
                                ]
                            ));
                            const frameTiming = toSerializable(scenario.frameTiming);
                            const renderThroughput = toSerializable(scenario.renderThroughput);
                            scenario.drawScaling.push({
                                objects: checkpoint,
                                mode,
                                batchCellSize,
                                hideSuppressedSources,
                                buildMs,
                                buildCpuMs,
                                preparationWaitMs: round(Math.max(0, buildMs - buildCpuMs)),
                                batchRebuildMs,
                                batchRebuildCpuMs,
                                modeTransition: toSerializable(modeTransition),
                                gpuDrain: toSerializable(gpuDrain),
                                frameTiming,
                                renderThroughput,
                                performance,
                                analysis: analyzeSceneScalabilityPoint(
                                    frameTiming,
                                    performance,
                                    limiter,
                                    renderThroughput
                                ),
                                limiter
                            });
                        }
                        }
                        }
                        scenario.warmup = checkpointWarmup;
                    }
                    scenario.createdCubeCount = created.length;
                    if (!scenario.warmup.ok) {
                        scenario.status = 'failed';
                        scenario.errors.push({ type: 'stress_scene_warmup_failed', warmup: toSerializable(scenario.warmup) });
                    }
                    const warmupHistory = safe(() => (
                        root.LightflowDiagnostics?.snapshot?.()?.shaderWarmup?.taskTimingHistory
                    ), []);
                    const scenarioWarmupTasks = Array.isArray(warmupHistory)
                        ? warmupHistory.slice(warmupHistoryStart).filter(task => task?.type === 'scene')
                        : [];
                    const sceneWarmupTask = [...scenarioWarmupTasks].reverse().find(
                        task => task?.cause === 'test_lab_stress_scene'
                    ) || scenarioWarmupTasks[scenarioWarmupTasks.length - 1] || null;
                    scenario.sceneWarmupTask = toSerializable(sceneWarmupTask);
                    if (Number(sceneWarmupTask?.liveScenePrimeProgramDelta) > 0) {
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'stress_scene_incomplete_isolated_warmup_coverage',
                            liveScenePrimeProgramDelta: Number(sceneWarmupTask.liveScenePrimeProgramDelta),
                            liveScenePrimeMs: Number(sceneWarmupTask.liveScenePrimeMs) || 0
                        });
                    }
                    const latestByMode = {};
                    requestedModes.forEach(mode => {
                        const point = [...scenario.drawScaling].reverse().find(entry => entry.mode === mode);
                        if (point) latestByMode[mode] = point.performance;
                    });
                    scenario.sceneScalabilityByMode = toSerializable(latestByMode);
                    const lastPoint = scenario.drawScaling[scenario.drawScaling.length - 1] || null;
                    scenario.sceneScalability = toSerializable(lastPoint?.performance || null);
                    const batchingGatePoints = requestedModes.length > 1
                        ? scenario.drawScaling.filter(point => (
                            point.objects === created.length &&
                            (point.mode === 'lightflow' || point.mode === 'cinematic_craft')
                        ))
                        : [lastPoint].filter(Boolean);
                    batchingGatePoints.forEach(point => {
                        const savedSceneDraws = (
                            Number(point.performance?.savedRenderDraws) || 0
                        ) + (
                            Number(point.performance?.savedDynamicInstanceDraws) || 0
                        );
                        if (created.length < 32 || savedSceneDraws > 0) return;
                        scenario.status = 'failed';
                        scenario.errors.push({
                            type: 'stress_scene_batching_unavailable',
                            mode: point.mode,
                            createdCubeCount: created.length,
                            renderBatches: Number(point.performance?.renderBatches) || 0,
                            dynamicInstanceBatches: Number(point.performance?.dynamicInstanceBatches) || 0,
                            estimatedSceneDrawsPerFrame: Number(point.performance?.estimatedSceneDrawsPerFrame) || 0
                        });
                    });
                    if (!sceneOnly) await this.measureCameraOrbit(scenario);
                } finally {
                    if (originalMode && getMode() !== originalMode) {
                        try {
                            scenario.modeRestore = toSerializable(await switchMode(originalMode, this.config, null));
                        } catch (error) {
                            scenario.warnings.push({
                                type: 'stress_scene_mode_restore_failed',
                                requested: originalMode,
                                actual: getMode(),
                                message: error?.message || String(error)
                            });
                        }
                    }
                    if (root.ShaderEngine) {
                        root.ShaderEngine.renderBatchSpatialCellSize = originalBatchCellSize;
                        root.ShaderEngine.renderBatchHideSuppressedSources = originalHideSuppressedSources;
                    }
                    created.forEach(cube => safe(() => cube.remove?.(), null));
                    safe(() => root.ShaderEngine?.updateAllCubes?.('test_lab_stress_scene_cleanup'), null);
                    safe(() => root.Canvas?.updateAll?.(), null);
                    await frames(4);
                    if (root.Project && typeof saved === 'boolean') root.Project.saved = saved;
                }
            });
        }

        async runSoakScenario() {
            await this.scenario('80.soak.mixed_runtime', 'Mixed viewport endurance soak', async scenario => {
                const preview = getPreview();
                if (!preview?.camera || !root.THREE) {
                    scenario.status = 'skipped';
                    scenario.reason = 'camera_unavailable';
                    return;
                }
                const cameraState = captureCameraState(preview);
                const cube = root.Cube?.all?.find?.(item => item?.visibility !== false) || null;
                const cubeState = cube ? captureCubeState(cube) : null;
                const lightState = captureLightState();
                const lightRecord = lightState.find(record => Array.isArray(record.position)) || null;
                const originalIsolation = toSerializable(safe(() => root.LightflowPerformanceIsolation?.get?.(), {})) || {};
                const graph = safe(() => root.LightflowRenderer?.describeGraph?.(), null);
                const availablePasses = new Set((graph?.registeredPasses || []).map(pass => pass.id));
                const soakPasses = ['ao', 'ssr_resolve', 'atmosphere', 'rendercraft_rim', 'viewport_composer'].filter(pass => availablePasses.has(pass));
                const target = cameraState.target?.clone?.() || new root.THREE.Vector3();
                const offset = cameraState.position.clone().sub(target);
                const radius = Math.max(1, offset.length());
                const y = offset.y;
                const horizontal = Math.sqrt(Math.max(0.001, radius * radius - y * y));
                const angle0 = Math.atan2(offset.z, offset.x);
                const duration = this.config.soakDurationMs;
                const sampler = new FrameSampler(duration);
                scenario.expectedDurationMs = duration;
                scenario.soakPasses = soakPasses.slice();
                scenario.heapBefore = toSerializable(safe(() => ({
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit
                }), null));
                let lastMutationBucket = -1;
                try {
                    scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                        const phase = elapsed / 1000;
                        const angle = angle0 + Math.sin(phase * 0.33) * 0.75;
                        preview.camera.position.set(target.x + Math.cos(angle) * horizontal, target.y + y, target.z + Math.sin(angle) * horizontal);
                        preview.camera.lookAt(target);
                        if (cube && cubeState?.from && cubeState?.to && frameIndex % 3 === 0) {
                            const shift = Math.sin(phase * 2.1) * 0.4;
                            cube.from[0] = cubeState.from[0] + shift;
                            cube.to[0] = cubeState.to[0] + shift;
                            updateElementTransform(cube, 'soak_move');
                        }
                        if (lightRecord?.element && lightRecord.position && frameIndex % 10 === 0) {
                            lightRecord.element.position[0] = lightRecord.position[0] + Math.sin(phase * 0.8) * 2;
                            lightRecord.element.position[2] = lightRecord.position[2] + Math.cos(phase * 0.8) * 2;
                            notifyLightsChanged([lightRecord.element], { shadows: true, scene: true });
                        }
                        const mutationBucket = Math.floor(elapsed / 2500);
                        if (soakPasses.length && mutationBucket !== lastMutationBucket) {
                            lastMutationBucket = mutationBucket;
                            const pass = soakPasses[mutationBucket % soakPasses.length];
                            root.LightflowPerformanceIsolation?.set?.(pass, mutationBucket % 2 === 0);
                        }
                        preview.render?.();
                        this.sampleTelemetry(scenario, elapsed);
                    });
                    scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
                    scenario.heapAfter = toSerializable(safe(() => ({
                        used: performance.memory.usedJSHeapSize,
                        total: performance.memory.totalJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit
                    }), null));
                    scenario.heapDeltaBytes = numericDelta(scenario.heapBefore?.used, scenario.heapAfter?.used);
                } finally {
                    if (cube && cubeState) restoreCubeState(cube, cubeState);
                    if (lightState.length) restoreLightState(lightState);
                    root.LightflowPerformanceIsolation?.reset?.();
                    Object.entries(originalIsolation).forEach(([pass, enabled]) => {
                        root.LightflowPerformanceIsolation?.set?.(pass, enabled !== false);
                    });
                    restoreCameraState(preview, cameraState);
                }
            });
        }

        async runContextRecoveryScenario() {
            await this.scenario('85.recovery.webgl_context_loss', 'WebGL context loss and complete recovery', async scenario => {
                scenario.expectedContextLoss = true;
                const preview = getPreview();
                const renderer = preview?.renderer;
                const canvas = renderer?.domElement;
                const gl = safe(() => renderer?.getContext?.(), null);
                const extension = safe(() => gl?.getExtension?.('WEBGL_lose_context'), null);
                if (!gl || !canvas || !extension?.loseContext || !extension?.restoreContext) {
                    scenario.status = 'skipped';
                    scenario.reason = 'webgl_lose_context_unavailable';
                    return;
                }
                const waitForEvent = (name, timeoutMs) => new Promise((resolve, reject) => {
                    let timer = null;
                    const handler = event => {
                        if (name === 'webglcontextlost') event?.preventDefault?.();
                        if (timer !== null) clearTimeout(timer);
                        canvas.removeEventListener(name, handler, false);
                        resolve({ name, at: wallIso() });
                    };
                    canvas.addEventListener(name, handler, false);
                    timer = setTimeout(() => {
                        canvas.removeEventListener(name, handler, false);
                        reject(new Error(`${name} was not observed within ${timeoutMs} ms.`));
                    }, timeoutMs);
                });
                const timeout = this.config.contextRestoreTimeoutMs;
                scenario.expectedDurationMs = timeout * 2;
                const lostPromise = waitForEvent('webglcontextlost', timeout);
                extension.loseContext();
                scenario.lossEvent = await lostPromise;
                await sleep(250);
                const restoredPromise = waitForEvent('webglcontextrestored', timeout);
                extension.restoreContext();
                scenario.restoreEvent = await restoredPromise;
                await frames(6);
                const deadline = now() + timeout;
                while (safe(() => renderer.getContext().isContextLost(), true) && now() < deadline) await frames(1);
                safe(() => preview.render?.(), null);
                scenario.warmup = await waitForWarmupStable(this.config, milestone => scenario.milestones.push(milestone));
                scenario.contextRestored = !safe(() => renderer.getContext().isContextLost(), true);
                scenario.graphAfterRestore = toSerializable(safe(() => root.LightflowRenderer?.describeGraph?.(), null));
                if (!scenario.contextRestored || !scenario.warmup.ok) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'context_recovery_incomplete',
                        contextRestored: scenario.contextRestored,
                        warmup: toSerializable(scenario.warmup)
                    });
                }
            });
        }

        async runLeakAuditScenario() {
            await this.scenario('90.integrity.resource_leak_audit', 'Final resource and lifecycle leak audit', async scenario => {
                const originalMode = this.transaction?.originalMode;
                if (originalMode && getMode() !== originalMode) {
                    scenario.auditStateRestore = await switchMode(originalMode, this.config, scenario);
                }
                const auditWarmup = await waitForWarmupStable(
                    this.config,
                    milestone => scenario.milestones.push(milestone)
                );
                scenario.auditWarmup = auditWarmup;
                await frames(3);
                const auditStartSnapshot = getArchitectureSnapshot();
                await this.measureIdle(scenario, Math.max(500, this.config.settleDurationMs));
                await frames(6);
                if (typeof root.gc === 'function') safe(() => root.gc(), null);
                await sleep(250);
                const stableScenario = this.report.scenarios.find(item => item.id === '00.current.warmup_stability');
                const baseline = this.resourceBaseline || stableScenario?.after || this.report.initial;
                const finalSnapshot = getArchitectureSnapshot();
                const baseRenderer = baseline?.renderer || {};
                const auditStartRenderer = auditStartSnapshot?.renderer || {};
                const sessionDelta = {
                    programs: numericDelta(baseRenderer.programs, finalSnapshot?.renderer?.programs),
                    textures: numericDelta(baseRenderer.textures, finalSnapshot?.renderer?.textures),
                    geometries: numericDelta(baseRenderer.geometries, finalSnapshot?.renderer?.geometries)
                };
                const settledDelta = {
                    programs: numericDelta(auditStartRenderer.programs, finalSnapshot?.renderer?.programs),
                    textures: numericDelta(auditStartRenderer.textures, finalSnapshot?.renderer?.textures),
                    geometries: numericDelta(auditStartRenderer.geometries, finalSnapshot?.renderer?.geometries)
                };
                // Program growth from the session baseline includes legitimate
                // first-use variants compiled by the suite itself. A program leak
                // must keep growing after warm-up has settled. Texture/geometry
                // budgets still use the complete session to catch forgotten
                // temporary scene resources.
                const switchingOnly = this.config.runProjectSwitching === true &&
                    this.config.runStress !== true;
                const delta = {
                    programs: settledDelta.programs,
                    // Project switching intentionally retains bounded, signature-
                    // addressed scene resources for already-open tabs. In that
                    // suite, continued growth after settling is the leak signal.
                    textures: switchingOnly ? settledDelta.textures : sessionDelta.textures,
                    geometries: switchingOnly ? settledDelta.geometries : sessionDelta.geometries
                };
                scenario.baseline = toSerializable(baseline);
                scenario.auditStartSnapshot = toSerializable(auditStartSnapshot);
                scenario.programBaselineAfterModeStress = toSerializable(this.programBaselineAfterModeStress);
                scenario.finalSnapshot = toSerializable(finalSnapshot);
                scenario.sessionResourceGrowth = sessionDelta;
                scenario.settledResourceGrowth = settledDelta;
                scenario.resourceGrowth = delta;
                const violations = [];
                if (!auditWarmup.ok) {
                    violations.push({
                        resource: 'audit_warmup',
                        state: auditWarmup.state || getWarmupState().state,
                        timedOut: !!auditWarmup.timedOut
                    });
                }
                if (Number(delta.programs) > this.config.maxProgramGrowth) violations.push({ resource: 'programs', growth: delta.programs, limit: this.config.maxProgramGrowth });
                if (Number(delta.textures) > this.config.maxTextureGrowth) violations.push({ resource: 'textures', growth: delta.textures, limit: this.config.maxTextureGrowth });
                if (Number(delta.geometries) > this.config.maxGeometryGrowth) violations.push({ resource: 'geometries', growth: delta.geometries, limit: this.config.maxGeometryGrowth });
                const graphErrors = finalSnapshot?.graph?.validationErrors || finalSnapshot?.graph?.errors || [];
                if (Array.isArray(graphErrors) && graphErrors.length) violations.push({ resource: 'frame_graph', errors: toSerializable(graphErrors) });
                const warmup = getWarmupState();
                if (warmup.state === 'DEGRADED' || warmup.state === 'FAILED') violations.push({ resource: 'warmup_state', state: warmup.state });
                if (violations.length) {
                    scenario.status = 'failed';
                    scenario.errors.push({ type: 'resource_or_lifecycle_leak', violations });
                } else if ([...Object.values(sessionDelta), ...Object.values(settledDelta)].some(value => Number(value) > 0)) {
                    scenario.warnings.push({
                        type: 'resource_growth_within_budget',
                        evaluated: delta,
                        session: sessionDelta,
                        settled: settledDelta
                    });
                }
            });
        }

        async scenario(id, label, body, options = {}) {
            this.assertNotCancelled();
            const scenario = {
                id,
                label,
                status: 'running',
                startedAt: wallIso(),
                startMs: round(now() - this.capture.startedAt),
                mode: getMode(),
                hasOverrides: !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false),
                milestones: [],
                errors: [],
                warnings: [],
                before: null,
                after: null,
                deltas: null,
                webglErrorsBefore: [],
                webglErrorsAfter: [],
                webglErrorCheckpoints: [],
                longTasks: null,
                frameTiming: null,
                telemetry: [],
                operationTimings: {},
                screenshotKey: null
            };
            this.currentScenario = scenario;
            this.capture.scenarioId = id;
            this.capture.phase = 'scenario';
            this.report.scenarios.push(scenario);
            this.progress.beginScenario(id, label);
            scenario.webglErrorsBefore = drainWebGLErrors();
            scenario.before = getArchitectureSnapshot();
            // Do not mix p95/pass samples from a previous mode or scenario with
            // the measurement that is about to start.
            safe(() => root.LightflowFrameProfiler?.resetHistory?.(getPreview()), false);
            const consoleStart = this.report.console.length;
            const runtimeErrorStart = this.report.runtimeErrors.length;
            const runtimeOccurrenceStart = this.capture.runtimeErrorOccurrences;
            const contextStart = this.report.contextEvents.length;
            const eventStart = this.report.events.length;
            const longTasks = new LongTaskCapture(this.config.captureLongTasks, this.capture.startedAt);
            longTasks.start();
            const started = now();
            try {
                await body(scenario);
                if (scenario.status === 'running') scenario.status = 'passed';
            } catch (error) {
                scenario.status = 'failed';
                scenario.errors.push(toSerializable(error));
                console.error(`[Lightflow Test Lab] Scenario ${id} failed.`, error);
            } finally {
                longTasks.stop();
                scenario.durationMs = round(now() - started);
                scenario.endedAt = wallIso();
                scenario.after = getArchitectureSnapshot();
                scenario.profilerStatistics = toSerializable(safe(() => root.LightflowFrameProfiler?.getStatistics?.(getPreview()), null));
                const terminalWebGLErrors = drainWebGLErrors();
                const checkpointErrors = (scenario.webglErrorCheckpoints || []).flatMap(
                    checkpoint => checkpoint.errors || []
                );
                scenario.webglErrorsAfter = checkpointErrors.concat(terminalWebGLErrors);
                scenario.longTasks = longTasks.summary();
                if (this.config.suite === 'shader_compilation') {
                    const responsivenessFailure = getCompilationResponsivenessFailure(
                        scenario, this.report.sessionPacing?.samples || []
                    );
                    if (responsivenessFailure) {
                        scenario.status = 'failed';
                        scenario.errors.push(responsivenessFailure);
                    }
                }
                scenario.console = this.report.console.slice(consoleStart);
                scenario.runtimeErrors = this.report.runtimeErrors.slice(runtimeErrorStart);
                scenario.runtimeErrorOccurrences = Math.max(0, this.capture.runtimeErrorOccurrences - runtimeOccurrenceStart);
                scenario.contextEvents = this.report.contextEvents.slice(contextStart);
                scenario.events = this.report.events.slice(eventStart);
                scenario.deltas = buildScenarioDeltas(scenario.before, scenario.after);
                if (scenario.webglErrorsAfter.length && this.config.failOnWebGLError && !scenario.expectedContextLoss) {
                    scenario.status = 'failed';
                    scenario.errors.push({ type: 'webgl_errors', errors: scenario.webglErrorsAfter.slice() });
                }
                if (scenario.runtimeErrorOccurrences > 0 && this.config.failOnRuntimeError) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'runtime_errors',
                        unique: scenario.runtimeErrors.length,
                        occurrences: scenario.runtimeErrorOccurrences
                    });
                }
                if (!scenario.expectedContextLoss && scenario.contextEvents.some(event => event.type === 'lost')) {
                    scenario.status = 'failed';
                    scenario.errors.push({ type: 'context_loss' });
                }
                const timeoutWarnings = scenario.console.filter(entry => /warm[- ]?up.*timed out|shader.*timed out|hard safety ceiling/i.test(entry.text));
                if (timeoutWarnings.length) {
                    scenario.warnings.push({ type: 'warmup_timeout_console', count: timeoutWarnings.length });
                }
                const softBudgetWarnings = scenario.console.filter(entry => /soft wall-time budget/i.test(entry.text));
                if (softBudgetWarnings.length) {
                    scenario.warnings.push({ type: 'warmup_soft_budget', count: softBudgetWarnings.length });
                }
                const sourceBudgetWarnings = scenario.console.filter(entry => /Program source budget exceeded/i.test(entry.text));
                if (sourceBudgetWarnings.length) {
                    scenario.warnings.push({ type: 'shader_source_budget', count: sourceBudgetWarnings.length });
                }
                try { await this.maybeCaptureScenarioScreenshot(scenario); }
                catch (error) { scenario.warnings.push({ type: 'screenshot_capture_failed', message: error?.message || String(error) }); }
                this.currentScenario = null;
                this.capture.scenarioId = null;
                this.capture.phase = 'between_scenarios';
                this.progress.completeScenario(scenario.status);
            }
            return scenario;
        }

        addSkip(id, label, reason) {
            this.progress.beginScenario(id, label);
            this.report.scenarios.push({
                id, label, status: 'skipped', reason, startedAt: wallIso(), durationMs: 0,
                mode: getMode(), hasOverrides: !!safe(() => root.ShaderEngine?.projectHasMaterialOverrides?.(), false)
            });
            this.progress.completeScenario('skipped');
        }

        sampleTelemetry(scenario, elapsed, force = false) {
            if (!scenario) return;
            const last = scenario.telemetry?.length ? scenario.telemetry[scenario.telemetry.length - 1] : null;
            if (!force && last && elapsed - last.atMs < this.config.telemetryIntervalMs) return;
            if (Number.isFinite(scenario.expectedDurationMs) && scenario.expectedDurationMs > 0) {
                this.progress.setCurrentFraction(elapsed / scenario.expectedDurationMs, `${Math.min(100, Math.floor(elapsed / scenario.expectedDurationMs * 100))}% of scenario`);
            }
            const diagnostics = getDiagnostics();
            const compactDiagnostics = compactDiagnosticsTelemetry(diagnostics);
            scenario.telemetry.push({
                atMs: round(elapsed),
                renderer: getRendererSnapshot(),
                warmup: compactDiagnostics.warmup,
                lifecycle: compactDiagnostics.lifecycle,
                performance: compactDiagnostics.performance,
                performanceLimiter: compactDiagnostics.performanceLimiter,
                profiler: toSerializable(safe(() => root.LightflowFrameProfiler?.getProfile?.(getPreview()), null)),
                frameBudget: toSerializable(safe(() => root.LightflowFrameBudget?.get?.(), null)),
                animationRuntime: toSerializable(safe(() => root.LightflowAnimationRuntime?.snapshot?.(), null)),
                studio: toSerializable(safe(() => root.LightflowStudioRenderDiagnostics, null))
            });
        }

        async maybeCaptureScenarioScreenshot(scenario) {
            if (!this.config.captureScreenshots || !scenario || scenario.status === 'skipped') return;
            const shouldCapture = scenario.id === '01.current.idle' ||
                scenario.id === '29.fixture.overrides_restored' ||
                /31\..*\.mode\..*\.idle$/.test(scenario.id) ||
                /09\.feature\.(ao|bloom)\.(enabled|disabled)$/.test(scenario.id) ||
                /^\d+\.volume\.viewport\./.test(scenario.id);
            if (!shouldCapture) return;
            const dataUrl = capturePreviewPng();
            if (!dataUrl) return;
            const key = `${scenario.id.replace(/[^a-zA-Z0-9._-]+/g, '_')}.png`;
            this.report.attachments[key] = dataUrl;
            scenario.screenshotKey = key;
        }

        async runWorkflowDiagnosticsScenarios() {
            const engine = root.ShaderEngine;
            if (typeof engine?.canReuseCompletedPreviewRender !== 'function') {
                throw new Error('Reload the updated Shader Architect before running workflow diagnostics.');
            }
            const previous = engine.previewRenderReuseEnabled;
            const artKeys = root.LightManagerArtKeys;
            const artKeyModes = this.config.workflowArtKeyCacheModes;
            const batchModes = this.config.workflowArtKeyBatchModes;
            if ((artKeyModes || batchModes) && typeof artKeys?.beginFrame !== 'function') {
                throw new Error('Reload the updated Light Manager before running Art Key diagnostics.');
            }
            if (batchModes && (typeof artKeys?.getBatchSignature !== 'function' ||
                typeof engine.validateArtKeyRenderBatches !== 'function')) {
                throw new Error('Reload Light Manager and Shader Architect with Art Key batching support.');
            }
            const previousArtKeyCache = artKeys?.frameCacheEnabled;
            const previousArtKeyBatching = engine.artKeyBatchingEnabled;
            const mode = getMode();
            try {
                for (const [index, enabled] of (batchModes || artKeyModes || this.config.workflowRenderReuseModes).entries()) {
                    this.assertNotCancelled();
                    engine.previewRenderReuseEnabled = (artKeyModes || batchModes) ? true : enabled;
                    if (artKeyModes || batchModes) artKeys.frameCacheEnabled = batchModes ? true : enabled;
                    if (batchModes) {
                        engine.artKeyBatchingEnabled = enabled;
                        engine.rebuildRenderBatches();
                        engine.requestPreviewRender({ cause: 'art_key_batch_comparison' });
                    }
                    await sleep(this.config.settleDurationMs);
                    const workloads = [
                        ['idle', scenario => this.measureIdle(scenario)],
                        ['camera', scenario => this.measureCameraOrbit(scenario)],
                        ['edit', scenario => this.measureEditTransform(scenario)]
                    ];
                    if (this.config.workflowWorldEdits) workloads.push(
                        ['brightness', scenario => this.measureWorldSetting(scenario, 'brightness')],
                        ['distance_fog', scenario => this.measureWorldSetting(scenario, 'distance_fog')]
                    );
                    for (const [workload, measure] of workloads) {
                        this.assertNotCancelled();
                        if (getMode() !== mode) throw new Error('Preview mode changed during workflow comparison.');
                        // Restore/settle work must finish outside the next sample.
                        await sleep(this.config.settleDurationMs);
                        await this.scenario(`20.workflow.${index}.${enabled ? 'reuse' : 'baseline'}.${workload}`,
                            `Workflow ${index + 1}: ${enabled ? 'reuse' : 'baseline'} ${workload}`, async scenario => {
                                const before = { ...engine.previewRenderSchedulingStats };
                                const artBefore = { ...artKeys?.performance };
                                const batchBefore = { ...engine.artKeyBatchingStats };
                                await measure(scenario);
                                scenario.workflow = {
                                    mode, workload, reuseEnabled: engine.previewRenderReuseEnabled,
                                    artKeyCacheEnabled: artKeys?.frameCacheEnabled ?? null,
                                    artKeyBatchingEnabled: engine.artKeyBatchingEnabled ?? null,
                                    comparison: batchModes ? 'art_key_batching' : artKeyModes ? 'art_key_frame_cache' : 'preview_render_reuse',
                                    batching: {
                                        batches: engine.renderBatches?.size ?? null,
                                        members: engine.renderBatchMembers?.size ?? null,
                                        savedDraws: engine.renderBatchStats?.savedDraws ?? null,
                                        delta: Object.fromEntries(Object.keys(batchBefore).map(key => [
                                            key, numericDelta(batchBefore[key], engine.artKeyBatchingStats[key])
                                        ]))
                                    },
                                    artKeyDelta: Object.fromEntries(Object.keys(artBefore).map(key => [
                                        key, numericDelta(artBefore[key], artKeys.performance[key])
                                    ])),
                                    schedulingDelta: Object.fromEntries(Object.keys(before).map(key => [
                                        key, numericDelta(before[key], engine.previewRenderSchedulingStats[key])
                                    ]))
                                };
                            });
                    }
                }
            } finally {
                engine.previewRenderReuseEnabled = previous;
                if (artKeys) artKeys.frameCacheEnabled = previousArtKeyCache;
                if (batchModes) {
                    engine.artKeyBatchingEnabled = previousArtKeyBatching;
                    engine.rebuildRenderBatches();
                    engine.requestPreviewRender({ cause: 'art_key_batch_comparison_restore' });
                }
            }
        }

        async measureWorldSetting(scenario, kind) {
            const engine = root.ShaderEngine;
            const environment = root.LightflowEnvironment;
            const fog = environment?.settings;
            const brightness = Number(root.settings?.brightness?.value);
            if (kind === 'brightness' ? !Number.isFinite(brightness) || !engine?.applyWorldShadingSetting
                : !fog?.distance_fog_enabled || !environment?.setSettings) {
                scenario.status = 'skipped'; scenario.reason = `${kind}_unavailable`; return;
            }
            const project = root.Project;
            const saved = project?.saved;
            const original = kind === 'brightness' ? brightness : Number(fog.distance_fog_end);
            const apply = value => kind === 'brightness'
                ? engine.applyWorldShadingSetting('brightness', value)
                : environment.setSettings({ distance_fog_end: value }, { silent: true });
            const preview = getPreview();
            const before = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
            const sampler = new FrameSampler(this.config.scenarioDurationMs);
            const timings = [];
            scenario.expectedDurationMs = this.config.scenarioDurationMs;
            let lastEdit = -Infinity;
            try {
                scenario.frameTiming = await sampler.run((index, timestamp, elapsed) => {
                    this.assertNotCancelled();
                    if (root.Project !== project) throw new Error('Project changed during world-setting comparison.');
                    // Approximate a slider drag without enqueueing more than one
                    // update per visible host frame, or forcing extra renders.
                    if (elapsed - lastEdit >= 80) {
                        const wave = Math.sin(elapsed / 200);
                        const value = kind === 'brightness' ? Math.round(clamp(original + wave * 8, 0, 400))
                            : Math.max(Number(fog.distance_fog_start) + 1, original + wave * Math.max(1, Math.abs(original) * .05));
                        const start = now(); apply(value); timings.push(now() - start); lastEdit = elapsed;
                    }
                    this.sampleTelemetry(scenario, elapsed);
                });
                this.captureRenderThroughput(scenario, before, preview);
                scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
            } finally {
                scenario.operationTimings.worldSettingUpdateMs = timings;
                scenario.operationTimings.worldSettingUpdate = summarizeFrameDeltas(timings);
                if (root.Project === project) {
                    apply(original);
                    if (project && typeof saved === 'boolean') project.saved = saved;
                }
            }
        }

        captureRenderThroughput(scenario, beforeStatistics, preview) {
            const afterStatistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
            const renderedFrames = numericDelta(beforeStatistics?.totalFrames, afterStatistics?.totalFrames);
            const measuredDurationMs = Math.max(0, Number(scenario.frameTiming?.measuredDurationMs) || 0);
            scenario.renderThroughput = {
                measurement: 'passive_host_render_loop',
                renderedFrames: renderedFrames === null ? null : Math.max(0, renderedFrames),
                measuredDurationMs: round(measuredDurationMs),
                effectiveFps: renderedFrames !== null && measuredDurationMs > 0
                    ? round(Math.max(0, renderedFrames) * 1000 / measuredDurationMs, 2) : null,
                sampledRafCallbacks: Math.max(0, Number(scenario.frameTiming?.frames) || 0),
                renderToRafRatio: renderedFrames !== null && Number(scenario.frameTiming?.frames) > 0
                    ? round(Math.max(0, renderedFrames) / Number(scenario.frameTiming.frames), 3) : null,
                frameInterval: toSerializable(afterStatistics?.frameInterval || null)
            };
        }

        async measureIdle(scenario, durationMs = this.config.scenarioDurationMs) {
            scenario.expectedDurationMs = durationMs;
            const sampler = new FrameSampler(durationMs);
            const preview = getPreview();
            const beforeStatistics = safe(
                () => root.LightflowFrameProfiler?.getStatistics?.(preview),
                null
            );
            scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                this.sampleTelemetry(scenario, elapsed);
            });
            this.captureRenderThroughput(scenario, beforeStatistics, preview);
            this.sampleTelemetry(scenario, durationMs, true);
            scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
        }

        async measureCameraOrbit(scenario) {
            const preview = getPreview();
            if (!preview?.camera || !root.THREE) throw new Error('No camera is available for the camera-motion benchmark.');
            const beforeStatistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
            const state = captureCameraState(preview);
            const target = state.target?.clone?.() || new root.THREE.Vector3(0, 0, 0);
            let offset = state.position.clone().sub(target);
            if (offset.lengthSq() < 0.0001) offset.set(8, 5, 8);
            const radius = offset.length();
            const baseY = offset.y;
            const angle0 = Math.atan2(offset.z, offset.x);
            const totalAngle = root.THREE.MathUtils.degToRad(this.config.cameraOrbitDegrees);
            scenario.expectedDurationMs = this.config.scenarioDurationMs;
            const sampler = new FrameSampler(this.config.scenarioDurationMs);
            try {
                scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                    const t = clamp(elapsed / this.config.scenarioDurationMs, 0, 1);
                    const angle = angle0 + totalAngle * Math.sin(t * Math.PI * 2);
                    const horizontal = Math.sqrt(Math.max(0.0001, radius * radius - baseY * baseY));
                    preview.camera.position.set(
                        target.x + Math.cos(angle) * horizontal,
                        target.y + baseY,
                        target.z + Math.sin(angle) * horizontal
                    );
                    preview.camera.lookAt(target);
                    preview.controls?.target?.copy?.(target);
                    preview.controls?.update?.();
                    // The host renders connected previews continuously. Driving
                    // the camera must not add a second frame to each RAF sample.
                    this.sampleTelemetry(scenario, elapsed);
                });
                this.captureRenderThroughput(scenario, beforeStatistics, preview);
                this.sampleTelemetry(scenario, this.config.scenarioDurationMs, true);
                scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
            } finally {
                restoreCameraState(preview, state);
            }
        }

        async measureEditTransform(scenario) {
            const cube = (root.Cube?.selected?.[0] || root.Cube?.all?.find?.(item => item?.visibility !== false));
            if (!cube) {
                scenario.status = 'skipped';
                scenario.reason = 'no_cube';
                return;
            }
            const state = captureCubeState(cube);
            const from = state.from?.slice?.();
            const to = state.to?.slice?.();
            if (!from || !to) throw new Error('Selected cube does not expose from/to coordinates.');
            const sampler = new FrameSampler(this.config.scenarioDurationMs);
            const preview = getPreview();
            const beforeStatistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
            const warmupBefore = getWarmupState();
            const performanceBefore = getArchitectureSnapshot()?.diagnostics?.performance || {};
            scenario.expectedDurationMs = this.config.scenarioDurationMs;
            scenario.element = { uuid: cube.uuid || null, name: cube.name || null };
            scenario.transformMethod = 'Blockbench model data + Canvas.updateView(transform) + update_transform event';
            try {
                scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                    const t = elapsed / this.config.scenarioDurationMs;
                    const offset = Math.sin(t * Math.PI * 8) * this.config.editTransformDistance;
                    cube.from[0] = from[0] + offset;
                    cube.to[0] = to[0] + offset;
                    const operationStarted = now();
                    updateElementTransform(cube, 'move');
                    (scenario.operationTimings.transformUpdateMs ||= []).push(now() - operationStarted);
                    this.sampleTelemetry(scenario, elapsed);
                });
                this.captureRenderThroughput(scenario, beforeStatistics, preview);
                scenario.operationTimings.transformUpdate = summarizeFrameDeltas(
                    scenario.operationTimings.transformUpdateMs || [],
                    (scenario.operationTimings.transformUpdateMs || []).reduce((sum, value) => sum + value, 0)
                );
                this.sampleTelemetry(scenario, this.config.scenarioDurationMs, true);
                scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
            } finally {
                restoreCubeState(cube, state);
            }
            await frames(2);
            const warmupAfter = getWarmupState();
            const performanceAfter = getArchitectureSnapshot()?.diagnostics?.performance || {};
            scenario.transformWarmupAudit = {
                before: toSerializable(warmupBefore),
                after: toSerializable(warmupAfter),
                completedDelta: numericDelta(
                    performanceBefore.warmupCompleted,
                    performanceAfter.warmupCompleted
                ),
                failedDelta: numericDelta(
                    performanceBefore.warmupFailed,
                    performanceAfter.warmupFailed
                ),
                lastCause: performanceAfter.warmupLastCause || null
            };
            if (
                Number(scenario.transformWarmupAudit.completedDelta) > 0 ||
                Number(scenario.transformWarmupAudit.failedDelta) > 0 ||
                Number(warmupAfter.queue) > 0 ||
                Number(warmupAfter.activeJobs) > 0 ||
                warmupAfter.state === 'COMPILING'
            ) {
                scenario.status = 'failed';
                scenario.errors.push({
                    type: 'shader_warmup_triggered_by_transform',
                    audit: scenario.transformWarmupAudit
                });
            }
        }

        async measureAnimationPlayback(scenario, durationMs = this.config.animationDurationMs) {
            const animations = root.Animation?.all || [];
            if (!animations.length) {
                scenario.status = 'skipped';
                scenario.reason = 'no_animation';
                return;
            }
            const previousAnimation = root.Animation?.selected || null;
            const previousTime = root.Timeline?.time;
            const wasPlaying = !!root.Timeline?.playing;
            const previousEditorMode = root.Project?.mode || 'edit';
            const animation = previousAnimation || animations[0];
            const playAction = root.BarItems?.play_animation;
            let startedByAction = false;
            let animatorPreviewOriginal = null;
            let animatorPreviewMeasured = null;
            const animatorPreviewDurations = [];
            try {
                root.Modes?.options?.animate?.select?.();
                animation.select?.();
                // Editor selection schedules geometry work (including a 220ms
                // transform-settle callback). Measure playback only after that
                // preparation; preserve its latency separately in this scenario.
                if (!root.Timeline?.playing) {
                    const preparationStarted = now();
                    await sleep(Math.max(250, this.config.settleDurationMs));
                    await frames(2);
                    scenario.animationPreparationMs = round(now() - preparationStarted);
                }
                if (!root.Timeline?.playing && playAction?.click) {
                    playAction.click();
                    startedByAction = true;
                    await frames(2);
                }
                const nativePlaying = !!root.Timeline?.playing;
                if (this.config.animationRequireNativePlayback && !nativePlaying) {
                    scenario.status = 'skipped';
                    scenario.reason = 'native_animation_playback_unavailable';
                    return;
                }
                if (root.Animator && typeof root.Animator.preview === 'function') {
                    animatorPreviewOriginal = root.Animator.preview;
                    animatorPreviewMeasured = function lightflowTestLabMeasuredAnimatorPreview() {
                        const startedAt = now();
                        try {
                            return animatorPreviewOriginal.apply(this, arguments);
                        } finally {
                            animatorPreviewDurations.push(Math.max(0, now() - startedAt));
                        }
                    };
                    root.Animator.preview = animatorPreviewMeasured;
                }
                scenario.animation = { uuid: animation.uuid || null, name: animation.name || null, method: nativePlaying ? 'native_play_animation_action' : 'stepped_fallback' };
                const sampler = new FrameSampler(durationMs);
                const preview = getPreview();
                safe(() => root.LightflowFrameProfiler?.resetHistory?.(preview), false);
                const beforeStatistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
                const animationBefore = safe(() => root.LightflowAnimationRuntime?.snapshot?.(), null);
                const performanceBefore = getArchitectureSnapshot()?.diagnostics?.performance || {};
                const warmupBefore = getWarmupState();
                const completedFrameTimestamps = [];
                let lastProfileTimestamp = null;
                let nativePlaybackFrames = 0;
                let nativePlaybackStoppedAtMs = null;
                scenario.expectedDurationMs = durationMs;
                scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                    if (!nativePlaying) {
                        const length = Math.max(0.05, Number(animation.length) || 1);
                        if (root.Timeline) root.Timeline.time = (elapsed / 1000) % length;
                        safe(() => root.Animator?.preview?.(), null);
                        safe(() => getPreview()?.render?.(), null);
                    } else if (root.Timeline?.playing) {
                        nativePlaybackFrames++;
                    } else if (nativePlaybackStoppedAtMs === null) {
                        nativePlaybackStoppedAtMs = round(elapsed);
                    }
                    const profile = safe(() => root.LightflowFrameProfiler?.getProfile?.(preview), null);
                    const profileTimestamp = Number(profile?.timestamp);
                    if (
                        Number.isFinite(profileTimestamp) &&
                        profileTimestamp !== lastProfileTimestamp &&
                        profileTimestamp >= sampler.startedAt
                    ) {
                        completedFrameTimestamps.push(profileTimestamp);
                        lastProfileTimestamp = profileTimestamp;
                    }
                    this.sampleTelemetry(scenario, elapsed);
                });
                this.sampleTelemetry(scenario, durationMs, true);
                scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
                scenario.operationTimings.nativeAnimatorPreview = summarizeFrameDeltas(
                    animatorPreviewDurations,
                    animatorPreviewDurations.reduce((sum, value) => sum + value, 0)
                );
                const afterStatistics = safe(() => root.LightflowFrameProfiler?.getStatistics?.(preview), null);
                const animationAfter = safe(() => root.LightflowAnimationRuntime?.snapshot?.(), null);
                const performanceAfter = getArchitectureSnapshot()?.diagnostics?.performance || {};
                const warmupAfter = getWarmupState();
                const completedFrameDeltas = [];
                for (let index = 1; index < completedFrameTimestamps.length; index++) {
                    completedFrameDeltas.push(completedFrameTimestamps[index] - completedFrameTimestamps[index - 1]);
                }
                const measuredDurationMs = Math.max(0, Number(scenario.frameTiming?.measuredDurationMs) || 0);
                const renderedFrames = numericDelta(beforeStatistics?.totalFrames, afterStatistics?.totalFrames);
                scenario.completedFrameTiming = summarizeFrameDeltas(
                    completedFrameDeltas.length
                        ? completedFrameDeltas
                        : sampler.deltas,
                    measuredDurationMs
                );
                scenario.framePacing = summarizeFramePacing(
                    completedFrameDeltas.length ? completedFrameDeltas : sampler.deltas
                );
                scenario.renderThroughput = {
                    measurement: 'native_animation_host_render_loop',
                    renderedFrames: renderedFrames === null ? null : Math.max(0, renderedFrames),
                    measuredDurationMs: round(measuredDurationMs),
                    effectiveFps: renderedFrames !== null && measuredDurationMs > 0
                        ? round(Math.max(0, renderedFrames) * 1000 / measuredDurationMs, 2)
                        : null,
                    sampledRafCallbacks: Math.max(0, Number(scenario.frameTiming?.frames) || 0),
                    completedFrameSamples: completedFrameDeltas.length,
                    frameInterval: toSerializable(afterStatistics?.frameInterval || null),
                    frameCpu: toSerializable(afterStatistics?.frameCpu || null),
                    frameGpu: toSerializable(afterStatistics?.frameGpu || null),
                    passes: toSerializable(afterStatistics?.passes || {})
                };
                scenario.animationRuntime = {
                    before: toSerializable(animationBefore),
                    after: toSerializable(animationAfter),
                    metricsDelta: objectDelta(animationBefore?.metrics, animationAfter?.metrics, [
                        'framesEvaluated', 'motionFrames', 'matrixBytesUploaded',
                        'totalMatrixBytesUploaded', 'poseCpuTotalMs',
                        'hostRenderReuses', 'scheduledPreviewRenders',
                        'structuralRebuildsDuringPose', 'shadowInvalidations',
                        'aoInvalidations', 'ssrHistoryRejects'
                    ])
                };
                scenario.animationAudit = {
                    warmupCompletedDelta: numericDelta(performanceBefore.warmupCompleted, performanceAfter.warmupCompleted),
                    warmupFailedDelta: numericDelta(performanceBefore.warmupFailed, performanceAfter.warmupFailed),
                    warmupBefore: toSerializable(warmupBefore),
                    warmupAfter: toSerializable(warmupAfter),
                    renderBatchMembersBefore: performanceBefore.renderBatchMembers ?? null,
                    renderBatchMembersAfter: performanceAfter.renderBatchMembers ?? null,
                    dynamicInstancesBefore: performanceBefore.dynamicInstances ?? null,
                    dynamicInstancesAfter: performanceAfter.dynamicInstances ?? null,
                    aoMotionCadenceDelta: objectDelta(
                        performanceBefore.aoMotionCadence,
                        performanceAfter.aoMotionCadence,
                        ['evaluatedSignatures', 'reusedSignatures']
                    ),
                    rimMotionCadenceDelta: objectDelta(
                        performanceBefore.rimMotionCadence,
                        performanceAfter.rimMotionCadence,
                        ['evaluatedMasks', 'reusedMasks']
                    ),
                    nativePlaybackFrames,
                    nativePlaybackStoppedAtMs
                };
                if (nativePlaying && nativePlaybackStoppedAtMs !== null) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'native_animation_stopped_during_measurement',
                        stoppedAtMs: nativePlaybackStoppedAtMs
                    });
                }
                if (Number(scenario.animationRuntime.metricsDelta.structuralRebuildsDuringPose) > 0) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'structural_batch_rebuild_during_animation',
                        count: scenario.animationRuntime.metricsDelta.structuralRebuildsDuringPose
                    });
                }
                if (
                    Number(scenario.animationAudit.warmupCompletedDelta) > 0 ||
                    Number(scenario.animationAudit.warmupFailedDelta) > 0 ||
                    warmupAfter.state === 'COMPILING'
                ) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: 'shader_warmup_during_animation',
                        audit: scenario.animationAudit
                    });
                }
            } finally {
                if (
                    animatorPreviewOriginal && animatorPreviewMeasured &&
                    root.Animator?.preview === animatorPreviewMeasured
                ) {
                    root.Animator.preview = animatorPreviewOriginal;
                }
                if (startedByAction && root.Timeline?.playing && playAction?.click) safe(() => playAction.click(), null);
                if (Number.isFinite(previousTime) && root.Timeline) root.Timeline.time = previousTime;
                if (previousAnimation && root.Animation?.selected !== previousAnimation) safe(() => previousAnimation.select?.(), null);
                if (wasPlaying && !root.Timeline?.playing && playAction?.click) safe(() => playAction.click(), null);
                safe(() => root.Animator?.preview?.(), null);
                if (root.Project?.mode !== previousEditorMode) root.Modes?.options?.[previousEditorMode]?.select?.();
            }
        }

        async measureLightTransform(scenario) {
            const lights = Array.isArray(root.LightElement?.all) ? root.LightElement.all : [];
            const element = lights.find(light => Array.isArray(light?.position));
            if (!element) {
                scenario.status = 'skipped';
                scenario.reason = 'no_light';
                return;
            }
            const snapshot = captureLightState();
            const record = snapshot.find(entry => entry.element === element);
            const base = record?.position?.slice?.();
            if (!base) {
                scenario.status = 'skipped';
                scenario.reason = 'light_has_no_position';
                return;
            }
            scenario.light = { uuid: element.uuid || null, name: element.name || null, type: element.light_type || null };
            const sampler = new FrameSampler(this.config.scenarioDurationMs);
            scenario.expectedDurationMs = this.config.scenarioDurationMs;
            try {
                scenario.frameTiming = await sampler.run((frameIndex, timestamp, elapsed) => {
                    const t = elapsed / this.config.scenarioDurationMs;
                    element.position[0] = base[0] + Math.sin(t * Math.PI * 6) * 4;
                    element.position[2] = base[2] + Math.cos(t * Math.PI * 6) * 4;
                    const operationStarted = now();
                    notifyLightsChanged([element], { shadows: true, scene: true });
                    (scenario.operationTimings.lightUpdateMs ||= []).push(now() - operationStarted);
                    this.sampleTelemetry(scenario, elapsed);
                });
                scenario.operationTimings.lightUpdate = summarizeFrameDeltas(
                    scenario.operationTimings.lightUpdateMs || [],
                    (scenario.operationTimings.lightUpdateMs || []).reduce((sum, value) => sum + value, 0)
                );
                this.sampleTelemetry(scenario, this.config.scenarioDurationMs, true);
                scenario.frameDeltasMs = sampler.deltas.slice();
                scenario.frameTimestampsMs = sampler.timestamps.slice();
                scenario.frameSampleStartMs = round(sampler.startedAt - this.capture.startedAt);
            } finally {
                restoreLightState(snapshot);
            }
        }

        async measureTemporaryLight(scenario) {
            const LightClass = root.LightElement;
            if (typeof LightClass !== 'function') {
                scenario.status = 'skipped';
                scenario.reason = 'light_class_unavailable';
                return;
            }
            let light = null;
            const webglTracer = new WebGLErrorMethodTracer(this.config.traceWebGLErrors);
            const checkpoint = (label, details = null) => {
                const errors = checkpointWebGLErrors(scenario, label, details);
                // Full method tracing is intentionally expensive. Keep healthy
                // performance samples clean and arm it only after a coarse
                // checkpoint proves that this scenario is producing GL errors.
                if (errors.length && !webglTracer.wrappers.length) webglTracer.start();
                return errors;
            };
            const saved = root.Project?.saved;
            const programsBefore = getRendererSnapshot()?.programs;
            const programInventoryBefore = getRendererProgramInventory();
            try {
                light = new LightClass({
                    name: '__lightflow_test_lab_temp_light__',
                    light_type: 'point',
                    position: [8, 12, 8],
                    color: [255, 255, 255],
                    intensity: 1.0,
                    distance: 48,
                    has_shadow: true,
                    shadow_resolution: 512,
                    studio_shadow_resolution: 0
                });
                if (typeof light.addTo === 'function') light.addTo(safe(() => root.getCurrentGroup?.(), null));
                if (typeof light.init === 'function') light.init();
                root.Blockbench?.dispatchEvent?.('add_light', { object: light, source: 'lightflow_test_lab' });
                notifyLightsChanged([light], { shadows: true, scene: true });
                checkpoint('temporary_light.after_create_notify');
                scenario.light = { uuid: light.uuid || null, type: light.light_type || 'point', shadowResolution: light.shadow_resolution };
                const warmup = await waitForWarmupStable(this.config, milestone => scenario.milestones.push(milestone));
                scenario.warmup = warmup;
                checkpoint('temporary_light.after_warmup');
                if (!warmup.ok) {
                    scenario.status = 'failed';
                    scenario.errors.push({
                        type: warmup.stalled
                            ? 'warmup_scheduler_stall'
                            : (warmup.timedOut ? 'warmup_timeout' : 'warmup_failed'),
                        context: 'temporary_light',
                        durationMs: warmup.durationMs,
                        maxPollGapMs: warmup.maxPollGapMs || null,
                        failedDelta: warmup.failedDelta || 0
                    });
                }
                await this.measureIdle(scenario);
                checkpoint('temporary_light.after_idle_render');
                if (webglTracer.wrappers.length && !webglTracer.records.length) {
                    // An error found at the end of the timed sample has not yet
                    // passed through the freshly armed wrappers. Reproduce two
                    // ordinary frames outside the performance measurement.
                    getPreview()?.render?.();
                    await frames(2);
                }
                scenario.programsBeforeTopologyChange = programsBefore;
                scenario.programsAfterTopologyChange = getRendererSnapshot()?.programs;
                scenario.programTopologyDelta = summarizeRendererProgramDelta(
                    programInventoryBefore,
                    getRendererProgramInventory()
                );
            } finally {
                if (light) {
                    try { light.remove?.(); } catch (error) { console.warn('[Lightflow Test Lab] Temporary light remove failed.', error); }
                    safe(() => root.Blockbench?.dispatchEvent?.('remove_light', { object: light, source: 'lightflow_test_lab' }), null);
                    checkpoint('temporary_light.after_remove_event');
                    safe(() => root.update_light_element_callback?.({
                        elements: [light],
                        cleanup: true,
                        shadows: true,
                        scene: true,
                        gizmos: false
                    }), null);
                    checkpoint('temporary_light.after_cleanup_callback');
                    await frames(2);
                    checkpoint('temporary_light.after_cleanup_frames');
                }
                const methodTrace = webglTracer.stop();
                scenario.webglMethodTrace = methodTrace;
                const tracedErrors = methodTrace.records.flatMap(record => record.errors || []);
                if (tracedErrors.length) {
                    scenario.webglErrorCheckpoints.push({
                        label: 'temporary_light.webgl_method_trace',
                        at: wallIso(),
                        errors: tracedErrors,
                        names: tracedErrors.map(getWebGLErrorName),
                        details: toSerializable(methodTrace)
                    });
                }
                if (root.Project && typeof saved === 'boolean') root.Project.saved = saved;
            }
        }

        async measureShadowsToggle(scenario, enabled) {
            const lights = Array.isArray(root.LightElement?.all) ? root.LightElement.all : [];
            if (!lights.length) {
                scenario.status = 'skipped';
                scenario.reason = 'no_lights';
                return;
            }
            const snapshot = captureLightState();
            scenario.targetShadowState = enabled;
            try {
                lights.forEach(light => { light.has_shadow = enabled; });
                notifyLightsChanged(lights, { shadows: true, scene: true });
                await frames(2);
                await this.measureIdle(scenario);
            } finally {
                restoreLightState(snapshot);
            }
        }
    }

    function normalizeConfig(config) {
        const output = { ...DEFAULT_CONFIG, ...(config || {}) };
        const workflowModes = Array.isArray(output.workflowRenderReuseModes)
            ? output.workflowRenderReuseModes.filter(value => typeof value === 'boolean').slice(0, 8) : [];
        output.workflowRenderReuseModes = workflowModes.length
            ? workflowModes : DEFAULT_CONFIG.workflowRenderReuseModes.slice();
        const artKeyModes = Array.isArray(output.workflowArtKeyCacheModes)
            ? output.workflowArtKeyCacheModes.filter(value => typeof value === 'boolean').slice(0, 8) : [];
        output.workflowArtKeyCacheModes = artKeyModes.length ? artKeyModes : null;
        const batchModes = Array.isArray(output.workflowArtKeyBatchModes)
            ? output.workflowArtKeyBatchModes.filter(value => typeof value === 'boolean').slice(0, 8) : [];
        output.workflowArtKeyBatchModes = batchModes.length ? batchModes : null;
        output.workflowWorldEdits = output.workflowWorldEdits === true;
        output.manualWorkflowDurationMs = clamp(output.manualWorkflowDurationMs, 10000, 300000);
        if (output.runStudioPostBenchmark) output.runStudioQualityContract = true;
        output.scenarioDurationMs = clamp(output.scenarioDurationMs, 300, 30000);
        output.settleDurationMs = clamp(output.settleDurationMs, 200, 10000);
        output.warmupTimeoutMs = clamp(output.warmupTimeoutMs, 1000, 180000);
        output.warmupStableMs = clamp(output.warmupStableMs, 200, 10000);
        output.coldLoadPostReadyMs = clamp(output.coldLoadPostReadyMs, 0, 10000);
        output.coldLoadMinFrames = Math.round(clamp(output.coldLoadMinFrames, 2, 600));
        output.animationDurationMs = clamp(output.animationDurationMs, 500, 30000);
        output.animationIsolationDurationMs = clamp(output.animationIsolationDurationMs, 500, 30000);
        output.runAnimationMatrix = output.runAnimationMatrix === true;
        output.runAnimationIsolation = output.runAnimationIsolation === true;
        output.animationModeIds = Array.isArray(output.animationModeIds)
            ? Array.from(new Set(output.animationModeIds.filter(mode => MODE_IDS.includes(mode))))
            : null;
        output.animationShadowStates = Array.isArray(output.animationShadowStates)
            ? Array.from(new Set(output.animationShadowStates.filter(state => ['current', 'off', 'on'].includes(state))))
            : null;
        output.animationRequireNativePlayback = output.animationRequireNativePlayback === true;
        output.telemetryIntervalMs = clamp(output.telemetryIntervalMs, 100, 2000);
        output.progressConsoleStep = Math.round(clamp(output.progressConsoleStep, 1, 25));
        output.stressIterations = Math.round(clamp(output.stressIterations, 1, 100));
        output.stressCubeCount = Math.round(clamp(output.stressCubeCount, 0, 2000));
        output.stressLightCount = Math.round(clamp(output.stressLightCount, 0, 64));
        output.stressDurationMs = clamp(output.stressDurationMs, 1000, 120000);
        output.stressSceneOnly = output.stressSceneOnly === true;
        output.stressSceneModes = Array.isArray(output.stressSceneModes)
            ? Array.from(new Set(output.stressSceneModes.filter(mode => MODE_IDS.includes(mode))))
            : null;
        output.stressCubeCheckpoints = Array.isArray(output.stressCubeCheckpoints)
            ? Array.from(new Set(output.stressCubeCheckpoints
                .map(value => Math.round(clamp(value, 1, Math.max(1, output.stressCubeCount))))
                .filter(value => value <= output.stressCubeCount)))
                .sort((left, right) => left - right)
            : null;
        output.stressBatchCellSizes = Array.isArray(output.stressBatchCellSizes)
            ? Array.from(new Set(output.stressBatchCellSizes
                .map(value => Math.round(clamp(value, 16, 256)))))
                .sort((left, right) => right - left)
            : null;
        output.stressBatchSourceVisibilityModes = Array.isArray(output.stressBatchSourceVisibilityModes)
            ? Array.from(new Set(output.stressBatchSourceVisibilityModes.map(Boolean)))
            : null;
        output.gpuDrainTimeoutMs = clamp(output.gpuDrainTimeoutMs, 250, 10000);
        output.runProjectSwitching = output.runProjectSwitching === true;
        output.bootstrapProject = output.bootstrapProject === true;
        output.bootstrapFixtureCount = Math.round(clamp(output.bootstrapFixtureCount, 2, 4));
        output.bootstrapCloseReopen = output.bootstrapCloseReopen !== false;
        output.bootstrapIncludeAnimation = output.bootstrapIncludeAnimation !== false;
        output.projectSwitchIterations = Math.round(clamp(output.projectSwitchIterations, 1, 8));
        output.projectSwitchTimeoutMs = clamp(output.projectSwitchTimeoutMs, 5000, 180000);
        output.projectSwitchResourceReuseModes = Array.isArray(output.projectSwitchResourceReuseModes)
            ? Array.from(new Set(output.projectSwitchResourceReuseModes.map(Boolean)))
            : null;
        output.soakDurationMs = clamp(output.soakDurationMs, 5000, 3600000);
        output.contextRestoreTimeoutMs = clamp(output.contextRestoreTimeoutMs, 5000, 120000);
        output.maxProgramGrowth = Math.round(clamp(output.maxProgramGrowth, 0, 1000));
        output.maxTextureGrowth = Math.round(clamp(output.maxTextureGrowth, 0, 1000));
        output.maxGeometryGrowth = Math.round(clamp(output.maxGeometryGrowth, 0, 1000));
        output.buildLabel = String(output.buildLabel || '').slice(0, 120);
        output.sceneLabel = String(output.sceneLabel || '').slice(0, 120);
        output.studioSamples = clamp(output.studioSamples, 1, 8);
        ['studioSmokeResolution', 'studioHdResolution', 'studioUhdResolution', 'studioHeavyResolution'].forEach(key => {
            const value = Array.isArray(output[key]) ? output[key] : DEFAULT_CONFIG[key];
            output[key] = [clamp(value[0], 64, 16384), clamp(value[1], 64, 16384)];
        });
        output.studioPostBenchmarkSamples = Array.isArray(output.studioPostBenchmarkSamples)
            ? Array.from(new Set(output.studioPostBenchmarkSamples.map(value => (
                Math.round(clamp(value, 1, 8))
            )))).sort((left, right) => left - right)
            : DEFAULT_CONFIG.studioPostBenchmarkSamples.slice();
        if (!output.studioPostBenchmarkSamples.includes(1)) {
            output.studioPostBenchmarkSamples.unshift(1);
        }
        output.studioPostBenchmarkWarmRepeats = Math.round(clamp(
            output.studioPostBenchmarkWarmRepeats,
            0,
            3
        ));
        output.studioHdModes = Array.isArray(output.studioHdModes)
            ? output.studioHdModes.filter(mode => MODE_IDS.includes(mode))
            : DEFAULT_CONFIG.studioHdModes.slice();
        output.modeIds = Array.isArray(output.modeIds)
            ? Array.from(new Set(output.modeIds.filter(mode => MODE_IDS.includes(mode))))
            : null;
        output.tags = Array.isArray(output.tags) ? output.tags.map(String).slice(0, 20) : [];
        return output;
    }

    function createReport(config) {
        return {
            schema: 'lightflow-test-lab-report',
            schemaVersion: REPORT_SCHEMA_VERSION,
            labVersion: LAB_VERSION,
            runId: `lf-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            config: toSerializable(config),
            environment: null,
            initial: null,
            final: null,
            initialWebGLErrors: [],
            scenarios: [],
            events: [],
            console: [],
            runtimeErrors: [],
            contextEvents: [],
            progressEvents: [],
            progress: null,
            attachments: {},
            fatalError: null,
            summary: null,
            performanceDiagnostics: null
        };
    }

    function buildScenarioDeltas(before, after) {
        return {
            renderer: objectDelta(before?.renderer, after?.renderer, ['calls', 'triangles', 'programs', 'textures', 'geometries']),
            warmup: {
                stateBefore: before?.diagnostics?.shaderWarmup?.state ?? null,
                stateAfter: after?.diagnostics?.shaderWarmup?.state ?? null,
                completedDelta: numericDelta(before?.diagnostics?.performance?.warmupCompleted, after?.diagnostics?.performance?.warmupCompleted),
                failedDelta: numericDelta(before?.diagnostics?.performance?.warmupFailed, after?.diagnostics?.performance?.warmupFailed),
                programDelta: numericDelta(before?.diagnostics?.renderer?.programs, after?.diagnostics?.renderer?.programs)
            }
        };
    }

    function numericDelta(a, b) {
        const first = Number(a);
        const second = Number(b);
        return Number.isFinite(first) && Number.isFinite(second) ? second - first : null;
    }

    function analyzeSceneScalabilityPoint(frameTiming, performance, limiter = null, renderThroughput = null) {
        const statistics = performance?.logicalFrameStatistics || {};
        const finite = value => (
            value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
                ? null
                : Number(value)
        );
        const rounded = value => value === null ? null : round(value);
        const profiledFrameP95Ms = finite(statistics.frameInterval?.p95);
        const frameP95Ms = profiledFrameP95Ms ?? finite(frameTiming?.p95Ms);
        const cpuP95Ms = finite(statistics.frameCpu?.p95 ?? performance?.logicalFrameCpuMs);
        const gpuP95Ms = finite(statistics.frameGpu?.p95 ?? performance?.logicalFrameGpuMs);
        const profiledValues = [cpuP95Ms, gpuP95Ms].filter(Number.isFinite);
        const profiledEnvelopeMs = profiledValues.length ? Math.max(...profiledValues) : null;
        const unattributedFrameIntervalMs = frameP95Ms !== null && profiledEnvelopeMs !== null
            ? Math.max(0, frameP95Ms - profiledEnvelopeMs)
            : null;
        const targetFrameMs = finite(performance?.frameBudget?.targetFrameMs) ?? 1000 / 60;
        const topGpuPasses = Object.entries(statistics.passes || {})
            .map(([name, pass]) => ({
                name,
                p95Ms: finite(pass?.gpu?.p95),
                samples: Math.max(0, Number(pass?.gpu?.samples) || 0),
                callsP95: finite(pass?.calls?.p95)
            }))
            .filter(pass => pass.p95Ms !== null)
            .sort((left, right) => right.p95Ms - left.p95Ms)
            .slice(0, 8);
        const topCpuPasses = Object.entries(statistics.passes || {})
            .map(([name, pass]) => ({
                name,
                p95Ms: finite(pass?.cpu?.p95),
                samples: Math.max(0, Number(pass?.cpu?.samples) || 0)
            }))
            .filter(pass => pass.p95Ms !== null)
            .sort((left, right) => right.p95Ms - left.p95Ms)
            .slice(0, 8);
        const pacingGapDominant = frameP95Ms !== null && frameP95Ms > targetFrameMs &&
            unattributedFrameIntervalMs !== null &&
            unattributedFrameIntervalMs >= Math.max(3, frameP95Ms * 0.2);

        return {
            frameP95Ms: rounded(frameP95Ms),
            frameTimingSource: profiledFrameP95Ms !== null
                ? 'lightflow_completed_frames'
                : 'request_animation_frame',
            renderedFps: rounded(finite(renderThroughput?.effectiveFps)),
            cpuP95Ms: rounded(cpuP95Ms),
            gpuP95Ms: rounded(gpuP95Ms),
            cpuGpuRatio: cpuP95Ms !== null && gpuP95Ms !== null && gpuP95Ms > 0
                ? round(cpuP95Ms / gpuP95Ms, 3)
                : null,
            profiledEnvelopeMs: rounded(profiledEnvelopeMs),
            unattributedFrameIntervalMs: rounded(unattributedFrameIntervalMs),
            targetFrameMs: rounded(targetFrameMs),
            budgetMissMs: frameP95Ms !== null ? round(Math.max(0, frameP95Ms - targetFrameMs)) : null,
            totalDrawReduction: finite(performance?.batchingDiagnostics?.totalDrawReduction),
            eligibleDrawCoverage: finite(performance?.batchingDiagnostics?.eligibleDrawCoverage),
            decision: pacingGapDominant
                ? 'frame_pacing_or_unprofiled_cpu'
                : (limiter?.id || 'collecting'),
            topCpuPasses,
            topGpuPasses
        };
    }

    function buildStudioPostBenchmarkSummary(scenarios = []) {
        const finite = value => (
            value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
                ? null
                : Number(value)
        );
        const cases = scenarios
            .filter(scenario => scenario?.studioPostBenchmarkCase)
            .map(scenario => {
                const benchmarkCase = scenario.studioPostBenchmarkCase;
                const diagnostics = scenario.studioDiagnostics || {};
                const ao = diagnostics.ambientOcclusion || {};
                const resolution = Array.isArray(benchmarkCase.resolution)
                    ? benchmarkCase.resolution.slice(0, 2)
                    : (Array.isArray(scenario.studioSettings?.resolution)
                        ? scenario.studioSettings.resolution.slice(0, 2)
                        : null);
                return {
                    id: scenario.id,
                    status: scenario.status,
                    kind: benchmarkCase.kind || null,
                    resolutionClass: benchmarkCase.resolutionClass || null,
                    resolution,
                    pixels: resolution ? Number(resolution[0]) * Number(resolution[1]) : null,
                    samples: Number(benchmarkCase.samples) || 1,
                    aoEnabled: benchmarkCase.aoEnabled === true,
                    bloomEnabled: benchmarkCase.bloomEnabled === true,
                    reuse: benchmarkCase.reuse === true,
                    repeatIndex: benchmarkCase.repeatIndex ?? null,
                    totalMs: finite(diagnostics.totalMs ?? scenario.studioWallMs),
                    shaderPrepareMs: finite(diagnostics.shaderPrepareMs),
                    tileRenderMs: finite(diagnostics.tileRenderMs),
                    finalCompositeMs: finite(diagnostics.finalCompositeMs),
                    encodeMs: finite(diagnostics.encodeMs),
                    tileCount: finite(diagnostics.tileCount),
                    maxGpuFenceMs: finite(diagnostics.maxGpuFenceMs),
                    aoGpuMsP95: finite(ao.fullGpuMsP95),
                    aoStorageFormat: ao.storageFormat || null,
                    bloomDrawCalls: finite(diagnostics.bloomDrawCalls),
                    bloomEstimatedBytes: finite(diagnostics.bloomEstimatedBytes),
                    bloomSourceMode: diagnostics.bloomSourceMode || null,
                    contractPassed: scenario.studioPostQualityContract?.passed ?? null
                };
            });
        if (!cases.length) return null;
        const passed = cases.filter(item => item.status === 'passed');
        const baseline = passed.find(item => (
            item.kind === 'baseline' && item.resolutionClass === 'hd' && item.samples === 1
        ));
        const featureCosts = ['ao_only', 'bloom_only', 'combined'].map(kind => {
            const item = passed.find(candidate => (
                candidate.kind === kind && candidate.resolutionClass === 'hd' &&
                candidate.samples === 1 && !candidate.reuse
            ));
            if (!item) return null;
            const renderDeltaMs = baseline && item.tileRenderMs !== null && baseline.tileRenderMs !== null
                ? round(item.tileRenderMs - baseline.tileRenderMs)
                : null;
            return {
                kind,
                renderMs: item.tileRenderMs === null ? null : round(item.tileRenderMs),
                renderDeltaMs,
                overheadPercent: baseline && renderDeltaMs !== null && baseline.tileRenderMs > 0
                    ? round(renderDeltaMs / baseline.tileRenderMs * 100, 1)
                    : null,
                aoGpuMsP95: item.aoGpuMsP95,
                bloomDrawCalls: item.bloomDrawCalls
            };
        }).filter(Boolean);
        const combined = passed.filter(item => item.kind === 'combined' && !item.reuse);
        const sampleScaling = [];
        const resolutionScaling = [];
        ['hd', 'uhd'].forEach(resolutionClass => {
            const group = combined
                .filter(item => item.resolutionClass === resolutionClass && item.tileRenderMs > 0)
                .sort((left, right) => left.samples - right.samples);
            if (group.length < 2) return;
            const low = group[0];
            const high = group[group.length - 1];
            sampleScaling.push({
                resolutionClass,
                lowSamples: low.samples,
                highSamples: high.samples,
                lowRenderMs: round(low.tileRenderMs),
                highRenderMs: round(high.tileRenderMs),
                sampleRatio: round(high.samples / low.samples, 3),
                timeRatio: round(high.tileRenderMs / low.tileRenderMs, 3)
            });
        });
        Array.from(new Set(combined.map(item => item.samples))).forEach(sampleCount => {
            const group = combined
                .filter(item => item.samples === sampleCount && item.pixels > 0 && item.tileRenderMs > 0)
                .sort((left, right) => left.pixels - right.pixels);
            if (group.length < 2) return;
            const low = group[0];
            const high = group[group.length - 1];
            const pixelRatio = high.pixels / low.pixels;
            const timeRatio = high.tileRenderMs / low.tileRenderMs;
            resolutionScaling.push({
                samples: sampleCount,
                lowResolution: low.resolution,
                highResolution: high.resolution,
                pixelRatio: round(pixelRatio, 3),
                timeRatio: round(timeRatio, 3),
                scalingExponent: pixelRatio > 1 && timeRatio > 0
                    ? round(Math.log(timeRatio) / Math.log(pixelRatio), 3)
                    : null
            });
        });
        const prepared = passed.filter(item => item.kind === 'combined' && item.reuse);
        const reuse = prepared.map(item => {
            const cold = combined.find(candidate => (
                candidate.resolutionClass === item.resolutionClass && candidate.samples === item.samples
            ));
            return {
                id: item.id,
                samples: item.samples,
                coldTotalMs: cold?.totalMs === null || cold?.totalMs === undefined ? null : round(cold.totalMs),
                warmTotalMs: item.totalMs === null ? null : round(item.totalMs),
                speedup: cold?.totalMs > 0 && item.totalMs > 0
                    ? round(cold.totalMs / item.totalMs, 3)
                    : null,
                coldShaderPrepareMs: cold?.shaderPrepareMs === null || cold?.shaderPrepareMs === undefined
                    ? null
                    : round(cold.shaderPrepareMs),
                warmShaderPrepareMs: item.shaderPrepareMs === null ? null : round(item.shaderPrepareMs)
            };
        });
        return {
            status: cases.every(item => item.status === 'passed') ? 'passed' : 'attention',
            cases,
            featureCosts,
            sampleScaling,
            resolutionScaling,
            reuse
        };
    }

    // Pure report reducer used by the live runner and the Node regression tests.
    // It deliberately keeps RAF pacing separate from profiler CPU/GPU timings:
    // a browser can throttle RAF while the renderer is idle, and timer queries
    // can be unavailable even when pacing data is useful.
    function buildPerformanceDiagnosticSummary(report = {}) {
        const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
        const timed = scenarios.filter(scenario => (
            scenario?.status !== 'skipped' && (scenario.completedFrameTiming || scenario.frameTiming)
        ));
        const timings = timed.map(scenario => scenario.completedFrameTiming || scenario.frameTiming);
        const finite = value => (
            value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
                ? null
                : Number(value)
        );
        const max = values => {
            const numbers = values.map(finite).filter(value => value !== null);
            return numbers.length ? Math.max(...numbers) : null;
        };
        const sum = (values, fallback = 0) => values.reduce((total, value) => total + (finite(value) ?? fallback), 0);
        // Include failed/timed scenarios too: excluding their samples would hide
        // the exact hitch a diagnostic run is meant to capture.
        const steadyRows = scenarios.filter(scenario => scenario?.status !== 'skipped').flatMap(scenario => (
            (Array.isArray(scenario.frameDeltasMs) ? scenario.frameDeltasMs : []).map((deltaMs, index) => ({
                scenarioId: scenario.id || null,
                scenarioLabel: scenario.label || null,
                index,
                atMs: Number.isFinite(scenario.frameTimestampsMs?.[index]) && Number.isFinite(scenario.frameSampleStartMs)
                    ? round(scenario.frameSampleStartMs + scenario.frameTimestampsMs[index]) : null,
                deltaMs
            }))
        ));
        const sessionRows = report.sessionPacing?.samples || [];
        const rawRows = sessionRows.length ? sessionRows : steadyRows;
        const rawTiming = summarizeFrameDeltas(rawRows.map(row => row.deltaMs));
        const scenarioQuantile = key => {
            const values = timings.map(timing => finite(timing?.[key])).filter(value => value !== null).sort((a, b) => a - b);
            return values.length ? round(percentile(values, 0.5)) : null;
        };
        const attributionRows = timed.map(scenario => {
            const validP95 = timing => timing && (timing.samples === undefined || Number(timing.samples) > 0)
                ? finite(timing.p95) : null;
            const cpuP95Ms = validP95(scenario.renderThroughput?.frameCpu ?? scenario.profilerStatistics?.frameCpu);
            const gpuP95Ms = validP95(scenario.renderThroughput?.frameGpu ?? scenario.profilerStatistics?.frameGpu);
            return { scenarioId: scenario.id || null, cpuP95Ms, gpuP95Ms };
        }).filter(row => row.cpuP95Ms !== null && row.gpuP95Ms !== null);
        const worstAttribution = attributionRows.slice().sort((left, right) => (
            Math.max(right.cpuP95Ms, right.gpuP95Ms) - Math.max(left.cpuP95Ms, left.gpuP95Ms)
        ))[0] || null;
        const eventCounts = {};
        (report.events || []).forEach(event => {
            const name = event?.name || 'unknown';
            eventCounts[name] = (eventCounts[name] || 0) + 1;
        });
        const initialRenderer = report.initial?.renderer || {};
        const finalRenderer = report.final?.renderer || {};
        const resourceGrowth = {
            programs: numericDelta(initialRenderer.programs, finalRenderer.programs),
            textures: numericDelta(initialRenderer.textures, finalRenderer.textures),
            geometries: numericDelta(initialRenderer.geometries, finalRenderer.geometries)
        };
        const frame = {
            scenarioCount: timed.length,
            source: sessionRows.length ? 'continuous_session_raf' : (rawRows.length ? 'pooled_raw_frame_deltas' : 'scenario_quantiles_fallback'),
            rawSamples: rawRows.length,
            p50Ms: rawRows.length ? rawTiming.medianMs : scenarioQuantile('medianMs'),
            p95Ms: rawRows.length ? rawTiming.p95Ms : scenarioQuantile('p95Ms'),
            p99Ms: rawRows.length ? rawTiming.p99Ms : scenarioQuantile('p99Ms'),
            maxMs: rawRows.length ? rawTiming.worstMs : max(timings.map(timing => timing?.worstMs)),
            gapsOver33ms: rawRows.length ? rawTiming.gapsOver33ms : sum(timings.map(timing => timing?.gapsOver33ms)),
            gapsOver50ms: rawRows.length ? rawTiming.gapsOver50ms : sum(timings.map(timing => timing?.gapsOver50ms)),
            gapsOver100ms: rawRows.length ? rawTiming.gapsOver100ms : sum(timings.map(timing => timing?.gapsOver100ms)),
            schedulerPauseCount: rawRows.length ? rawTiming.schedulerPauseCount : sum(timings.map(timing => timing?.schedulerPauseCount)),
            schedulerPausedMs: rawRows.length ? rawTiming.schedulerPausedMs : round(sum(timings.map(timing => timing?.schedulerPausedMs))),
            activeP95Ms: rawRows.length ? summarizeFrameDeltas(rawRows.map(row => row.deltaMs).filter(value => value < 1000)).p95Ms : null,
            activeFps: rawRows.length ? summarizeFrameDeltas(rawRows.map(row => row.deltaMs).filter(value => value < 1000)).effectiveFps : scenarioQuantile('activeEffectiveFps')
        };
        const longTaskRows = scenarios.map(scenario => scenario.longTasks || {}).filter(task => task.supported);
        const profiler = {
            cpuP95Ms: worstAttribution?.cpuP95Ms ?? null,
            gpuP95Ms: worstAttribution?.gpuP95Ms ?? null,
            scenarioId: worstAttribution?.scenarioId ?? null,
            gpuSupported: !!worstAttribution,
            attribution: worstAttribution ? 'instrumented_cpu_gpu_same_scenario' : 'unavailable'
        };
        const isolation = (report.summary?.featureCosts || []).map(item => ({
            pass: item.pass,
            p95DeltaMs: item.p95DeltaMs,
            p95DeltaPct: item.p95DeltaPct,
            reliable: item.reliable === true
        })).sort((left, right) => (Number(right.p95DeltaMs) || -Infinity) - (Number(left.p95DeltaMs) || -Infinity));
        const visibility = report.environment?.platform || {};
        const throttled = visibility.documentHidden === true || visibility.visibilityState === 'hidden' || frame.schedulerPauseCount > 0;
        const diagnosis = {
            frame,
            steadyFrame: summarizeFrameDeltas(steadyRows.map(row => row.deltaMs)),
            slowOperations: scenarios.flatMap(scenario => [
                ...(scenario.modeTransition?.transitionMs > 100 ? [{ scenarioId: scenario.id, operation: 'mode_transition', durationMs: scenario.modeTransition.transitionMs }] : []),
                ...(scenario.drawScaling || []).flatMap(row => ['buildMs', 'batchRebuildMs'].filter(key => row[key] > 100)
                    .map(key => ({ scenarioId: scenario.id, operation: key, objects: row.objects, durationMs: row[key] })))
            ]).sort((a, b) => b.durationMs - a.durationMs),
            shaderCompileErrors: (report.console || []).filter(entry => /shader.*compile failed|shader error|VALIDATE_STATUS.*false/i.test(entry.text || ''))
                .map(entry => ({ atMs: entry.atMs, message: entry.text.split(' {"materialName"')[0] })),
            longTasks: {
                supported: longTaskRows.length > 0,
                count: sum(longTaskRows.map(task => task.count)),
                totalMs: round(sum(longTaskRows.map(task => task.totalMs))),
                worstMs: max(longTaskRows.map(task => task.worstMs))
            },
            profiler,
            invalidationAndEvents: {
                totalEvents: sum(Object.values(eventCounts)),
                counts: eventCounts,
                transformEvents: eventCounts.update_transform || 0,
                animationEvents: eventCounts.display_animation_frame || 0,
                pipelineEvents: (eventCounts.lightflow_frame_pipeline_ready || 0) + (eventCounts.lightflow_frame_pipeline_disposed || 0)
            },
            resources: resourceGrowth,
            isolation,
            measurement: {
                visibilityState: visibility.visibilityState ?? null,
                documentHidden: visibility.documentHidden ?? null,
                hasFocus: visibility.hasFocus ?? null,
                throttledOrSuspended: throttled,
                profilerMode: report.config?.profilerMode ?? null,
                profilerOverhead: report.config?.profilerMode === 'deep' ? 'deep_profiler_can_add_measurement_overhead' : null
            }
        };
        diagnosis.bottlenecks = classifyPerformanceBottlenecks(diagnosis);
        diagnosis.frameSamples = rawRows;
        diagnosis.limitations = [
            ...(!sessionRows.length ? ['This report samples selected steady intervals only. Project loading, mode preparation and nested stress checkpoints are not fully covered by its RAF summary.'] : []),
            ...(throttled ? ['Large RAF gaps can be compiler/main-thread freezes or host suspension. Raw samples retain them; active timing alone cannot diagnose the cause.'] : []),
            ...(!diagnosis.profiler.gpuSupported ? ['GPU timer-query attribution is unavailable; CPU and GPU causes cannot be separated from this run.'] : []),
            ...(!diagnosis.longTasks.supported ? ['Long Task API is unavailable in this host, so main-thread stalls may be underreported.'] : []),
            ...(report.config?.profilerMode === 'deep' ? ['Deep profiler mode can perturb very short frame measurements.'] : [])
        ];
        return diagnosis;
    }

    function classifyPerformanceBottlenecks(diagnosis = {}) {
        const frame = diagnosis.frame || {};
        const profiler = diagnosis.profiler || {};
        const findings = [];
        const add = (id, severity, evidence, action) => findings.push({ id, severity, evidence, action });
        if (diagnosis.shaderCompileErrors?.length) add('shader_compilation_failure', 'high', diagnosis.shaderCompileErrors,
            'Fix the original shader error before attributing later degraded warm-up checks to independent failures.');
        const hidden = diagnosis.measurement?.documentHidden === true || diagnosis.measurement?.visibilityState === 'hidden';
        if (diagnosis.measurement?.throttledOrSuspended) add(hidden ? 'host_throttling' : 'scheduler_pause', 'attention', {
            schedulerPauseCount: frame.schedulerPauseCount || 0,
            visibilityState: diagnosis.measurement.visibilityState || null
        }, hidden ? 'Keep Blockbench visible and rerun to measure foreground pacing.'
            : 'Correlate raw gaps with long tasks and scenario timings; a pause alone does not distinguish application freezes from host suspension.');
        if (Number(frame.p95Ms) > 16.7 || Number(frame.gapsOver33ms) > 0) add('frame_pacing', Number(frame.p95Ms) > 33.3 ? 'high' : 'medium', {
            p95Ms: frame.p95Ms, p99Ms: frame.p99Ms, maxMs: frame.maxMs,
            gapsOver33ms: frame.gapsOver33ms, gapsOver50ms: frame.gapsOver50ms, gapsOver100ms: frame.gapsOver100ms
        }, 'Inspect the slowest scenario and pass-isolation delta before changing quality defaults.');
        if (Number(profiler.gpuP95Ms) > 0 && Number(profiler.gpuP95Ms) >= Number(profiler.cpuP95Ms || 0) * 1.2) add('gpu_bound', 'medium', {
            cpuP95Ms: profiler.cpuP95Ms, gpuP95Ms: profiler.gpuP95Ms
        }, 'Prioritize pixel passes, shadows, draw count, and resolution-sensitive effects.');
        if (Number(profiler.cpuP95Ms) > 0 && Number(profiler.cpuP95Ms) >= Number(profiler.gpuP95Ms || 0) * 1.2) add('cpu_bound', 'medium', {
            cpuP95Ms: profiler.cpuP95Ms, gpuP95Ms: profiler.gpuP95Ms
        }, 'Inspect invalidation/event churn, animation work, and scene traversal.');
        const topIsolation = (diagnosis.isolation || []).find(item => item.reliable && Number(item.p95DeltaMs) > 1);
        if (topIsolation) add('effect_cost', Number(topIsolation.p95DeltaMs) > 4 ? 'high' : 'medium', topIsolation,
            `Profile ${topIsolation.pass} in the affected scenario before changing its default.`);
        const resources = diagnosis.resources || {};
        if ([resources.programs, resources.textures, resources.geometries].some(value => Number(value) > 0)) add('resource_growth', 'attention', resources,
            'Compare session and settled resource deltas in the leak-audit scenario.');
        if (Number(diagnosis.longTasks?.count) > 0) add('main_thread_long_tasks', diagnosis.longTasks.worstMs > 100 ? 'high' : 'medium', diagnosis.longTasks,
            'Correlate long-task timestamps with scenario events and shader warm-up telemetry.');
        const order = { high: 3, attention: 2, medium: 1 };
        return findings.sort((left, right) => (order[right.severity] || 0) - (order[left.severity] || 0));
    }

    function buildReportSummary(report) {
        const scenarios = report.scenarios || [];
        const passed = scenarios.filter(s => s.status === 'passed').length;
        const failed = scenarios.filter(s => s.status === 'failed').length +
            (report.fatalError ? 1 : 0) + (report.cleanupErrors?.length || 0);
        const skipped = scenarios.filter(s => s.status === 'skipped').length;
        const preSuiteConsole = report.projectLoadCapture?.preSuite?.console || [];
        const scenarioWarmupTimeouts = scenarios.reduce((sum, s) => sum + (s.warnings || []).filter(w => w.type === 'warmup_timeout_console').reduce((n, w) => n + (w.count || 1), 0), 0);
        const scenarioWarmupSchedulerStalls = scenarios.reduce((sum, scenario) => (
            sum + (scenario.errors || []).filter(error => (
                error?.type === 'warmup_scheduler_stall' ||
                error?.type === 'stress_light_scheduler_stall'
            )).length
        ), 0);
        const scenarioSoftBudgets = scenarios.reduce((sum, s) => sum + (s.warnings || []).filter(w => w.type === 'warmup_soft_budget').reduce((n, w) => n + (w.count || 1), 0), 0);
        const scenarioSourceWarnings = scenarios.reduce((sum, s) => sum + (s.warnings || []).filter(w => w.type === 'shader_source_budget').reduce((n, w) => n + (w.count || 1), 0), 0);
        const preWarmupTimeouts = preSuiteConsole.filter(entry => /warm[- ]?up.*timed out|shader.*timed out|hard safety ceiling/i.test(entry.text || '')).length;
        const preSoftBudgets = preSuiteConsole.filter(entry => /soft wall-time budget/i.test(entry.text || '')).length;
        const preSourceWarnings = preSuiteConsole.filter(entry => /Program source budget exceeded/i.test(entry.text || '')).length;
        const webglErrorCount = (report.initialWebGLErrors?.length || 0) + scenarios.reduce((sum, s) => sum + (s.webglErrorsAfter?.length || 0), 0);
        const contextLosses = report.contextEvents.filter(event => event.type === 'lost').length +
            (report.projectLoadCapture?.preSuite?.contextEvents || []).filter(event => event.type === 'lost').length;
        const expectedContextLosses = scenarios.reduce((sum, scenario) => {
            if (!scenario.expectedContextLoss) return sum;
            return sum + (scenario.contextEvents || []).filter(event => event.type === 'lost').length;
        }, 0);
        const unexpectedContextLosses = Math.max(0, contextLosses - expectedContextLosses);
        const runtimeErrorOccurrences = (report.runtimeErrors || []).reduce(
            (sum, entry) => sum + (Number(entry.count) || 1),
            0
        );
        const ranked = scenarios
            .map(s => ({ scenario: s, timing: s.completedFrameTiming || s.frameTiming }))
            .filter(item => item.timing?.p95Ms !== null && Number.isFinite(item.timing?.p95Ms))
            .map(({ scenario: s, timing }) => ({
                id: s.id,
                label: s.label,
                p95Ms: timing.p95Ms,
                worstMs: timing.schedulerPauseCount > 0
                    ? timing.activeWorstMs
                    : timing.worstMs,
                wallClockWorstMs: timing.worstMs,
                effectiveFps: s.frameTiming?.schedulerPauseCount > 0
                    ? s.frameTiming.activeEffectiveFps
                    : (s.frameTiming?.effectiveFps ?? timing.effectiveFps),
                schedulerPauseCount: timing.schedulerPauseCount || 0,
                schedulerPausedMs: timing.schedulerPausedMs || 0
            }))
            .sort((a, b) => b.p95Ms - a.p95Ms);
        const edit = scenarios.find(s => s.id === '03.current.edit_transform');
        const animation = scenarios.find(s => s.id === '04.current.animation_playback');
        const editVsAnimation = edit?.frameTiming && animation?.frameTiming ? {
            editP95Ms: edit.frameTiming.p95Ms,
            animationP95Ms: animation.frameTiming.p95Ms,
            p95Ratio: animation.frameTiming.p95Ms > 0 ? round(edit.frameTiming.p95Ms / animation.frameTiming.p95Ms, 3) : null,
            editWorstMs: edit.frameTiming.worstMs,
            animationWorstMs: animation.frameTiming.worstMs,
            editTransformUpdateP95Ms: edit.operationTimings?.transformUpdate?.p95Ms ?? null
        } : null;

        const featureCosts = [];
        const isolationPasses = ['ao', 'ssr_resolve', 'atmosphere', 'rendercraft_rim', 'viewport_composer'];
        isolationPasses.forEach(pass => {
            const on = scenarios.find(s => s.id === `10.isolation.${pass}.on`);
            const off = scenarios.find(s => s.id === `11.isolation.${pass}.off`);
            if (!on?.frameTiming || !off?.frameTiming) return;
            const schedulerPauseCount =
                Math.max(0, Number(on.frameTiming.schedulerPauseCount) || 0) +
                Math.max(0, Number(off.frameTiming.schedulerPauseCount) || 0);
            const onP95Ms = Number(on.frameTiming.p95Ms);
            const offP95Ms = Number(off.frameTiming.p95Ms);
            const reliable = schedulerPauseCount === 0 &&
                Number.isFinite(onP95Ms) && Number.isFinite(offP95Ms);
            const p95DeltaMs = reliable ? onP95Ms - offP95Ms : null;
            const p95DeltaPct = reliable && offP95Ms > 0
                ? (p95DeltaMs / Number(off.frameTiming.p95Ms)) * 100
                : null;
            featureCosts.push({
                pass,
                onP95Ms: on.frameTiming.p95Ms,
                offP95Ms: off.frameTiming.p95Ms,
                p95DeltaMs: reliable ? round(p95DeltaMs) : null,
                p95DeltaPct: reliable ? round(p95DeltaPct) : null,
                onFps: on.frameTiming.effectiveFps,
                offFps: off.frameTiming.effectiveFps,
                reliable,
                reason: reliable ? null : 'scheduler_pause',
                schedulerPauseCount
            });
        });
        featureCosts.sort((a, b) => {
            if (a.reliable !== b.reliable) return a.reliable ? -1 : 1;
            return (b.p95DeltaMs || 0) - (a.p95DeltaMs || 0);
        });

        const modeMatrix = scenarios
            .filter(s => /^31\./.test(s.id) && s.frameTiming)
            .map(s => ({
                id: s.id,
                fixture: s.id.split('.')[1] || '',
                mode: s.id.split('.mode.')[1]?.split('.')[0] || s.mode || '',
                p95Ms: s.frameTiming.p95Ms,
                worstMs: s.frameTiming.worstMs,
                effectiveFps: s.frameTiming.effectiveFps,
                programs: s.after?.renderer?.programs ?? null
            }));

        const animationMatrix = scenarios
            .filter(s => /^5[01]\.animation\./.test(s.id))
            .map(s => {
                const timing = s.completedFrameTiming || s.frameTiming || null;
                const statistics = s.renderThroughput || s.profilerStatistics || {};
                const passes = statistics.passes || {};
                const topCpuPass = Object.entries(passes)
                    .map(([name, pass]) => ({ name, p95Ms: Number(pass?.cpu?.p95) }))
                    .filter(pass => Number.isFinite(pass.p95Ms))
                    .sort((left, right) => right.p95Ms - left.p95Ms)[0] || null;
                const topGpuPass = Object.entries(passes)
                    .map(([name, pass]) => ({ name, p95Ms: Number(pass?.gpu?.p95) }))
                    .filter(pass => Number.isFinite(pass.p95Ms))
                    .sort((left, right) => right.p95Ms - left.p95Ms)[0] || null;
                const p99Ms = Number(timing?.p99Ms);
                return {
                    id: s.id,
                    status: s.status,
                    mode: s.animationIsolation?.mode || s.id.split('.')[2] || s.mode || null,
                    state: s.animationIsolation
                        ? `${s.animationIsolation.passId}_${s.animationIsolation.enabled ? 'on' : 'off'}`
                        : (s.id.split('.')[3] || 'idle'),
                    visibleFps: s.frameTiming?.schedulerPauseCount > 0
                        ? s.frameTiming.activeEffectiveFps
                        : (s.frameTiming?.effectiveFps ?? null),
                    logicalRenderFps: s.renderThroughput?.effectiveFps ?? null,
                    renderToRafRatio: Number(s.frameTiming?.frames) > 0 && Number(s.renderThroughput?.renderedFrames) >= 0
                        ? round(Number(s.renderThroughput.renderedFrames) / Number(s.frameTiming.frames), 3)
                        : null,
                    p95Ms: timing?.p95Ms ?? null,
                    p99Ms: timing?.p99Ms ?? null,
                    onePercentLowFps: Number.isFinite(p99Ms) && p99Ms > 0 ? round(1000 / p99Ms, 2) : null,
                    cpuP95Ms: statistics.frameCpu?.p95 ?? null,
                    gpuP95Ms: statistics.frameGpu?.p95 ?? null,
                    animatorPreviewP95Ms: s.operationTimings?.nativeAnimatorPreview?.p95Ms ?? null,
                    pacingTier: s.framePacing?.p95Tier ?? null,
                    missed144Ratio: s.framePacing?.tiers?.[144]?.missedRatio ?? null,
                    missed60Ratio: s.framePacing?.tiers?.[60]?.missedRatio ?? null,
                    runtime: s.animationRuntime?.metricsDelta || null,
                    aoCadence: s.animationAudit?.aoMotionCadenceDelta || null,
                    rimCadence: s.animationAudit?.rimMotionCadenceDelta || null,
                    topCpuPass,
                    topGpuPass
                };
            });

        const studio = scenarios
            .filter(s => /^4[0-9]\.studio\./.test(s.id) || /^39\.studio\./.test(s.id))
            .map(s => ({
                id: s.id,
                status: s.status,
                mode: s.mode || null,
                resolution: Array.isArray(s.studioSettings?.resolution)
                    ? s.studioSettings.resolution.slice(0, 2)
                    : null,
                pixels: Array.isArray(s.studioSettings?.resolution)
                    ? Number(s.studioSettings.resolution[0]) * Number(s.studioSettings.resolution[1])
                    : null,
                samples: Math.max(1, Number(s.studioSettings?.samples) || 1),
                totalMs: s.studioDiagnostics?.totalMs ?? s.studioWallMs ?? null,
                tileRenderMs: s.studioDiagnostics?.tileRenderMs ?? null,
                finalCompositeMs: s.studioDiagnostics?.finalCompositeMs ?? null,
                encodeMs: s.studioDiagnostics?.encodeMs ?? null,
                tileSize: s.studioDiagnostics?.tileSize ?? s.studioResult?.tileSize ?? null,
                tileCount: s.studioDiagnostics?.tileCount ?? s.studioResult?.tileCount ?? null
            }));
        const studioScaling = [];
        const studioByMode = new Map();
        studio.filter(item => (
            item.status === 'passed' && item.pixels > 0 &&
            Number(item.tileRenderMs ?? item.totalMs) > 0
        )).forEach(item => {
            const key = `${item.mode || 'unknown'}|${item.samples}`;
            if (!studioByMode.has(key)) studioByMode.set(key, []);
            studioByMode.get(key).push(item);
        });
        studioByMode.forEach(items => {
            const ordered = items.slice().sort((left, right) => left.pixels - right.pixels);
            if (ordered.length < 2) return;
            const low = ordered[0];
            const high = ordered[ordered.length - 1];
            const lowMs = Number(low.tileRenderMs ?? low.totalMs);
            const highMs = Number(high.tileRenderMs ?? high.totalMs);
            const pixelRatio = high.pixels / low.pixels;
            const timeRatio = highMs / lowMs;
            studioScaling.push({
                mode: low.mode,
                samples: low.samples,
                lowResolution: low.resolution,
                highResolution: high.resolution,
                lowRenderMs: round(lowMs),
                highRenderMs: round(highMs),
                pixelRatio: round(pixelRatio, 3),
                timeRatio: round(timeRatio, 3),
                scalingExponent: pixelRatio > 1 && timeRatio > 0
                    ? round(Math.log(timeRatio) / Math.log(pixelRatio), 3)
                    : null,
                interpretation: timeRatio >= pixelRatio * 0.72
                    ? 'pixel_bandwidth_sensitive'
                    : (timeRatio <= pixelRatio * 0.35 ? 'fixed_or_submission_sensitive' : 'mixed')
            });
        });

        const preDiagnostics = report.projectLoadCapture?.preSuite?.diagnostics || [];
        const firstReady = preDiagnostics.find(item => item?.warmup?.state === 'READY');
        const coldLoad = report.projectLoadCapture?.preSuite ? {
            durationMs: report.projectLoadCapture.preSuite.durationMs,
            frameTiming: report.projectLoadCapture.preSuite.frameTiming,
            firstReadyAtMs: firstReady?.atMs ?? null,
            programCountAtEnd: preDiagnostics.length ? preDiagnostics[preDiagnostics.length - 1]?.renderer?.programs ?? null : null,
            warmupTimeouts: preWarmupTimeouts,
            shaderSourceBudgetWarnings: preSourceWarnings
        } : null;
        const finalSnapshot = report.final || {};
        const initialSnapshot = report.initial || {};
        const compiler = finalSnapshot.rendercraftCompiler || initialSnapshot.rendercraftCompiler || null;
        const compilerCache = finalSnapshot.programCompilers?.rendercraft || initialSnapshot.programCompilers?.rendercraft || null;
        const warmupDiagnostics = finalSnapshot.diagnostics?.shaderWarmup || initialSnapshot.diagnostics?.shaderWarmup || null;
        const warmupCompilerTelemetry = finalSnapshot.warmupCompilerTelemetry || initialSnapshot.warmupCompilerTelemetry || null;
        const warmupHistory = Array.isArray(warmupCompilerTelemetry?.taskTimingHistory)
            ? warmupCompilerTelemetry.taskTimingHistory
            : Array.isArray(warmupDiagnostics?.taskTimingHistory)
                ? warmupDiagnostics.taskTimingHistory
            : [];
        const sceneWarmups = warmupHistory.filter(task => (
            task?.type === 'scene' || task?.cause === 'project_material_overrides'
        ));
        // A small zero-delta follow-up often runs after the actual cold compile.
        // Report the slowest program-producing scene task so a costly exact-live
        // prime cannot be hidden by that final maintenance task.
        const coldSceneWarmup = sceneWarmups
            .filter(task => Number(task?.programDelta) > 0)
            .reduce((slowest, task) => (
                !slowest || Number(task?.durationMs) > Number(slowest?.durationMs)
                    ? task
                    : slowest
            ), null) || sceneWarmups.at(-1) || null;
        const rendercraftCompiler = compiler || compilerCache || coldSceneWarmup ? {
            family: compiler?.family ?? null,
            familyKey: compiler?.familyKey ?? null,
            pass: compiler?.pass ?? null,
            vertexChars: compiler?.vertexChars ?? null,
            fragmentChars: compiler?.fragmentChars ?? null,
            warmupMaxSourceChars: warmupDiagnostics?.maxSourceChars ?? null,
            warmupMaxFragmentChars: warmupDiagnostics?.maxFragmentChars ?? null,
            sourceFamilies: compilerCache?.sourceFamilies ?? null,
            cacheHits: compilerCache?.hits ?? null,
            cacheMisses: compilerCache?.misses ?? null,
            sourceAssembly: compilerCache?.sourceAssembly ?? null,
            dynamicLightLoop: compilerCache?.dynamicLightLoop ?? null,
            theoreticalBeautyFamilies: compilerCache?.theoreticalBeautyFamilies ?? null,
            theoreticalBloomFamilies: compilerCache?.theoreticalBloomFamilies ?? null,
            coldSceneWarmup: coldSceneWarmup ? {
                cause: coldSceneWarmup.cause ?? null,
                durationMs: coldSceneWarmup.durationMs ?? null,
                schedulerWallMs: coldSceneWarmup.schedulerWallMs ?? null,
                programDelta: coldSceneWarmup.programDelta ?? null,
                unitCount: coldSceneWarmup.unitCount ?? null,
                programFamilyCount: coldSceneWarmup.programFamilyCount ?? null,
                concurrency: coldSceneWarmup.concurrency ?? null,
                peakPendingPrograms: coldSceneWarmup.peakPendingPrograms ?? null,
                liveScenePrimeMs: coldSceneWarmup.liveScenePrimeMs ?? null,
                liveScenePrimeProgramDelta: coldSceneWarmup.liveScenePrimeProgramDelta ?? null,
                auxiliaryPrimeMs: coldSceneWarmup.auxiliaryPrimeMs ?? null,
                auxiliaryPrimeProgramDelta: coldSceneWarmup.auxiliaryPrimeProgramDelta ?? null,
                auxiliaryPrimeUnitCount: coldSceneWarmup.auxiliaryPrimeUnitCount ?? null,
                auxiliaryPrimeProgramFamilyCount: coldSceneWarmup.auxiliaryPrimeProgramFamilyCount ?? null,
                auxiliaryPrimeMaterialCount: coldSceneWarmup.auxiliaryPrimeMaterialCount ?? null,
                auxiliaryPrimeCacheHit: coldSceneWarmup.auxiliaryPrimeCacheHit === true,
                slowestUnits: (Array.isArray(coldSceneWarmup.slowestUnits)
                    ? coldSceneWarmup.slowestUnits
                    : [])
                    .slice(0, 8)
                    .map(unit => ({
                        type: unit?.type || null,
                        label: unit?.label || null,
                        familyKey: String(unit?.familyKey || '').slice(0, 2000) || null,
                        shaderId: unit?.shaderId || null,
                        materialName: unit?.materialName || null,
                        familySize: unit?.familySize ?? null,
                        fragmentLength: unit?.fragmentLength ?? null,
                        durationMs: unit?.durationMs ?? null,
                        programDelta: unit?.programDelta ?? null,
                        programDeltaAttribution: unit?.programDeltaAttribution || null,
                        success: unit?.success !== false
                    }))
            } : null
        } : null;
        const integrityScenario = scenarios.find(scenario => scenario.id === '90.integrity.resource_leak_audit');
        const sceneScalabilityScenario = scenarios.find(scenario => scenario.id === '75.stress.scene_scalability');
        const projectSwitchingScenario = scenarios.find(scenario => scenario.id === '60.project.switching');
        const studioPostQualityScenario = scenarios.find(
            scenario => scenario.id === '40.studio.quality_max.ao_bloom'
        );
        const studioPostBenchmark = buildStudioPostBenchmarkSummary(scenarios);

        const shaderCompileErrors = (report.console || []).filter(entry => /shader.*compile failed|shader error|VALIDATE_STATUS.*false/i.test(entry.text || '')).length;
        return {
            status: report.fatalError || failed || shaderCompileErrors || webglErrorCount || unexpectedContextLosses || runtimeErrorOccurrences || scenarioWarmupTimeouts || preWarmupTimeouts || scenarioWarmupSchedulerStalls ? 'attention' : 'clean',
            suite: report.config?.suite || null,
            scenarios: scenarios.length,
            passed,
            failed,
            skipped,
            webglErrorCount,
            contextLosses,
            expectedContextLosses,
            unexpectedContextLosses,
            runtimeErrors: runtimeErrorOccurrences,
            shaderCompileErrors,
            uniqueRuntimeErrors: report.runtimeErrors.length,
            warmupTimeouts: scenarioWarmupTimeouts + preWarmupTimeouts,
            warmupSchedulerStalls: scenarioWarmupSchedulerStalls,
            warmupSoftBudgetWarnings: scenarioSoftBudgets + preSoftBudgets,
            shaderSourceBudgetWarnings: scenarioSourceWarnings + preSourceWarnings,
            performanceLimiter: finalSnapshot.diagnostics?.performanceLimiter ||
                initialSnapshot.diagnostics?.performanceLimiter || null,
            coldLoad,
            rendercraftCompiler,
            sceneScalability: sceneScalabilityScenario ? {
                status: sceneScalabilityScenario.status,
                createdCubeCount: sceneScalabilityScenario.createdCubeCount ?? null,
                drawScaling: sceneScalabilityScenario.drawScaling || [],
                performance: sceneScalabilityScenario.sceneScalability || null,
                performanceByMode: sceneScalabilityScenario.sceneScalabilityByMode || null,
                warmup: sceneScalabilityScenario.sceneWarmupTask ? {
                    durationMs: sceneScalabilityScenario.sceneWarmupTask.durationMs ?? null,
                    liveScenePrimeMs: sceneScalabilityScenario.sceneWarmupTask.liveScenePrimeMs ?? null,
                    liveScenePrimeProgramDelta: sceneScalabilityScenario.sceneWarmupTask.liveScenePrimeProgramDelta ?? null
                } : null
            } : null,
            projectSwitching: projectSwitchingScenario ? {
                status: projectSwitchingScenario.status,
                openProjects: projectSwitchingScenario.openProjects || [],
                settledSwitches: projectSwitchingScenario.settledSwitches || [],
                rapidSwitches: projectSwitchingScenario.rapidSwitches || [],
                restore: projectSwitchingScenario.restore || null
            } : null,
            animationMatrix,
            slowestByP95: ranked.slice(0, 12),
            featureCosts,
            modeMatrix,
            studio,
            studioScaling,
            studioPostQuality: studioPostQualityScenario ? {
                status: studioPostQualityScenario.status,
                contract: studioPostQualityScenario.studioPostQualityContract || null,
                requested: studioPostQualityScenario.studioQualityRequest || null,
                diagnostics: studioPostQualityScenario.studioDiagnostics || null
            } : null,
            studioPostBenchmark,
            editVsAnimation,
            integrity: integrityScenario ? {
                status: integrityScenario.status,
                resourceGrowth: integrityScenario.resourceGrowth || null,
                warnings: integrityScenario.warnings || [],
                errors: integrityScenario.errors || []
            } : null
        };
    }

    function scenarioSummaryRow(scenario) {
        return {
            id: scenario.id,
            label: scenario.label,
            status: scenario.status,
            reason: scenario.reason || '',
            mode: scenario.mode || '',
            overrides: scenario.hasOverrides,
            duration_ms: scenario.durationMs ?? '',
            fps: scenario.frameTiming?.effectiveFps ?? '',
            frame_median_ms: scenario.frameTiming?.medianMs ?? '',
            frame_p95_ms: scenario.frameTiming?.p95Ms ?? '',
            frame_p99_ms: scenario.frameTiming?.p99Ms ?? '',
            frame_worst_ms: scenario.frameTiming?.worstMs ?? '',
            active_fps: scenario.frameTiming?.activeEffectiveFps ?? '',
            active_frame_worst_ms: scenario.frameTiming?.activeWorstMs ?? '',
            scheduler_pauses: scenario.frameTiming?.schedulerPauseCount ?? '',
            scheduler_paused_ms: scenario.frameTiming?.schedulerPausedMs ?? '',
            fps_1_low: scenario.frameTiming?.fps1Low ?? '',
            gaps_gt_50ms: scenario.frameTiming?.gapsOver50ms ?? '',
            gaps_gt_100ms: scenario.frameTiming?.gapsOver100ms ?? '',
            longtasks: scenario.longTasks?.count ?? '',
            longtask_worst_ms: scenario.longTasks?.worstMs ?? '',
            programs_before: scenario.before?.renderer?.programs ?? '',
            programs_after: scenario.after?.renderer?.programs ?? '',
            programs_delta: scenario.deltas?.warmup?.programDelta ?? '',
            warmup_failed_delta: scenario.deltas?.warmup?.failedDelta ?? '',
            webgl_errors: scenario.webglErrorsAfter?.length ?? 0,
            context_losses: scenario.contextEvents?.filter?.(event => event.type === 'lost')?.length ?? 0,
            studio_total_ms: scenario.studioDiagnostics?.totalMs ?? scenario.studioWallMs ?? '',
            studio_shader_prepare_ms: scenario.studioDiagnostics?.shaderPrepareMs ?? '',
            studio_shader_prepare_program_delta: scenario.studioDiagnostics?.shaderPrepareProgramDelta ?? '',
            studio_tile_ms: scenario.studioDiagnostics?.tileRenderMs ?? '',
            studio_composite_ms: scenario.studioDiagnostics?.finalCompositeMs ?? '',
            studio_encode_ms: scenario.studioDiagnostics?.encodeMs ?? ''
        };
    }

    function performanceFramesToCsv(report = {}) {
        const rows = report.performanceDiagnostics?.frameSamples || [];
        return [
            'scenario_id,scenario_label,index,at_ms,delta_ms',
            ...rows.map(row => [row.scenarioId, row.scenarioLabel, row.index, row.atMs, row.deltaMs]
                .map(csvEscape).join(','))
        ].join('\r\n');
    }

    function reportToCsv(report) {
        const rows = (report.scenarios || []).map(scenarioSummaryRow);
        if (!rows.length) return '';
        const columns = Object.keys(rows[0]);
        return [
            columns.join(','),
            ...rows.map(row => columns.map(column => csvEscape(row[column])).join(','))
        ].join('\r\n');
    }

    function reportToMarkdown(report) {
        const summary = report.summary || buildReportSummary(report);
        const env = report.environment || {};
        const formatCompilerMs = value => (
            value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
                ? round(Number(value), 1)
                : 'unavailable'
        );
        const lines = [
            '# Lightflow Test Lab Report',
            '',
            `- Run: \`${report.runId}\``,
            `- Test Lab: ${report.labVersion}`,
            `- Suite: ${summary.suite || report.config?.suite || 'custom'}`,
            `- Started: ${report.startedAt || ''}`,
            `- Duration: ${report.durationMs ?? ''} ms`,
            `- Blockbench: ${env.host?.blockbenchVersion || 'unknown'} (${env.platform?.isApp ? 'Desktop' : 'Web'})`,
            `- Three.js: r${env.host?.threeRevision || 'unknown'}`,
            `- GPU/WebGL renderer: ${env.webgl?.debugRenderer || 'unavailable'}`,
            `- Project: ${env.project?.name || 'unnamed'}`,
            '',
            '## Health',
            '',
            `- Scenarios: ${summary.scenarios} (${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped)`,
            `- WebGL errors: ${summary.webglErrorCount}`,
            `- Context losses: ${summary.contextLosses} (${summary.expectedContextLosses || 0} expected, ${summary.unexpectedContextLosses || 0} unexpected)`,
            `- Runtime errors: ${summary.runtimeErrors}`,
            `- Warm-up timeouts captured: ${summary.warmupTimeouts}`,
            `- Warm-up scheduler stalls: ${summary.warmupSchedulerStalls || 0}`,
            `- Shader source budget warnings: ${summary.shaderSourceBudgetWarnings}`,
            ''
        ];
        if (report.shaderCompilation) {
            lines.push('## Shader driver timing', '',
                'Selected preview context; instrumentation enabled for this run.', '',
                '| WebGL call | Calls | Total ms | Worst ms |',
                '| --- | ---: | ---: | ---: |');
            Object.entries(report.shaderCompilation.methods || {})
                .sort((a, b) => b[1].worstMs - a[1].worstMs)
                .forEach(([name, stats]) => lines.push(`| ${name} | ${stats.calls} | ${round(stats.totalMs, 1)} | ${round(stats.worstMs, 1)} |`));
            lines.push('', `- Slow calls omitted: ${report.shaderCompilation.droppedSlowCalls || 0}`,
                '- Call stacks and shader fingerprints: shader-compilation.json', '');
            lines.push('### Asynchronous program completion', '',
                'Elapsed link-to-completion observation time, including driver queueing.', '',
                '| Scenario at link | Elapsed ms | Shader fingerprints |', '| --- | ---: | --- |');
            (report.shaderCompilation.programs || []).slice()
                .sort((a, b) => b.durationMs - a.durationMs).slice(0, 10)
                .forEach(program => lines.push(`| ${program.scenarioId || ''} | ${program.durationMs} | ${(program.sources || []).filter(Boolean).map(source => `${source.hash} (${source.chars})`).join(', ')} |`));
            lines.push('');
        }
        const performanceDiagnostics = report.performanceDiagnostics || buildPerformanceDiagnosticSummary(report);
        if (performanceDiagnostics?.frame?.scenarioCount) {
            const frame = performanceDiagnostics.frame;
            lines.push('## Performance diagnosis', '');
            lines.push(`- RAF frame p50/p95/p99/max: ${frame.p50Ms ?? 'n/a'} / ${frame.p95Ms ?? 'n/a'} / ${frame.p99Ms ?? 'n/a'} / ${frame.maxMs ?? 'n/a'} ms`);
            lines.push(`- Hitches >33 / >50 / >100 ms: ${frame.gapsOver33ms} / ${frame.gapsOver50ms} / ${frame.gapsOver100ms}`);
            lines.push(`- CPU/GPU p95: ${performanceDiagnostics.profiler?.cpuP95Ms ?? 'unavailable'} / ${performanceDiagnostics.profiler?.gpuP95Ms ?? 'unavailable'} ms (${performanceDiagnostics.profiler?.attribution || 'unavailable'})`);
            lines.push(`- Long tasks: ${performanceDiagnostics.longTasks?.supported ? performanceDiagnostics.longTasks.count : 'unavailable'}${performanceDiagnostics.longTasks?.supported ? ` (worst ${performanceDiagnostics.longTasks.worstMs} ms)` : ''}`);
            lines.push(`- Shader compilation errors: ${summary.shaderCompileErrors || 0}`);
            lines.push(`- RAF coverage: ${frame.source}; steady intervals p95: ${performanceDiagnostics.steadyFrame?.p95Ms ?? 'n/a'} ms`);
            if (performanceDiagnostics.measurement?.throttledOrSuspended) lines.push('- Large RAF gaps detected: correlate their timestamps with loading, long tasks and window visibility.');
            (performanceDiagnostics.bottlenecks || []).slice(0, 5).forEach(item => lines.push(`- ${item.severity}: ${item.id} — ${item.action}`));
            lines.push('');
        }
        const volumeScenarios = (report.scenarios || []).filter(scenario => /\.volume\./.test(scenario.id || ''));
        if (volumeScenarios.length) {
            const viewportCases = volumeScenarios.filter(scenario => scenario.volumeViewport);
            const studioCase = volumeScenarios.find(scenario => Array.isArray(scenario.studioVolumeMatrix));
            lines.push('## Complete Volume Domain matrix', '');
            lines.push(`- Scenarios: ${volumeScenarios.length}; passed: ${volumeScenarios.filter(item => item.status === 'passed').length}; failed: ${volumeScenarios.filter(item => item.status === 'failed').length}; skipped: ${volumeScenarios.filter(item => item.status === 'skipped').length}`);
            lines.push('- Coverage: lifecycle, serialization, Undo copy, box/sphere, uniform/height/cloud, physical/shafts, viewport pixels, DPR/scissor bounds, transforms, multi-volume visibility, cache invalidation, canonical depth, Bloom reuse, Studio Render and cleanup.', '');
            if (viewportCases.length) {
                lines.push('| Viewport case | Route | Changed pixels | Outside bounds | New clipping | Status |', '|---|---|---:|---:|---:|---|');
                viewportCases.forEach(item => {
                    const evidence = item.volumeViewport || {};
                    const pixels = evidence.pixels || {};
                    lines.push(`| ${evidence.case || item.id} | ${evidence.resolvedTechnique || 'unknown'} | ${pixels.changedPixels ?? 'n/a'} | ${pixels.outsideChangedRatio ?? 'n/a'} | ${pixels.newlyClippedRatio ?? 'n/a'} | ${item.status} |`);
                });
                lines.push('');
            }
            if (studioCase) {
                lines.push('| Studio case | Duration ms | Changed vs no-volume | Pixel hash | Raymarch delta | Bloom extra raymarches | Status |', '|---|---:|---:|---|---:|---:|---|');
                studioCase.studioVolumeMatrix.forEach(item => {
                    lines.push(`| ${item.id} | ${item.durationMs ?? 'n/a'} | ${item.baselineDifference?.changedPixels ?? 'n/a'} | ${item.pixelHash || 'n/a'} | ${item.atmosphereDelta?.raymarches ?? 'n/a'} | ${item.atmosphereDelta?.bloomExtraRaymarches ?? 'n/a'} | ${item.ok ? 'passed' : 'failed'} |`);
                });
                lines.push('');
            }
        }
        if (summary.coldLoad) {
            lines.push('## Cold project-open capture', '');
            lines.push(`- Capture duration: ${summary.coldLoad.durationMs} ms`);
            lines.push(`- First warm-up READY observed: ${summary.coldLoad.firstReadyAtMs ?? 'not observed'} ms`);
            lines.push(`- Cold-load frame p95: ${summary.coldLoad.frameTiming?.p95Ms ?? ''} ms`);
            lines.push(`- Cold-load worst RAF gap: ${summary.coldLoad.frameTiming?.worstMs ?? ''} ms`);
            lines.push(`- Warm-up timeout messages: ${summary.coldLoad.warmupTimeouts}`);
            lines.push(`- Shader source budget warnings: ${summary.coldLoad.shaderSourceBudgetWarnings}`, '');
        }
        if (summary.performanceLimiter) {
            const limiter = summary.performanceLimiter;
            const metrics = limiter.metrics || {};
            lines.push('## Detected performance limiter', '');
            lines.push(`- Classification: ${limiter.id || 'unavailable'} (${limiter.confidence ?? 0}% confidence)`);
            lines.push(`- CPU/GPU p95: ${formatCompilerMs(metrics.cpuP95)} / ${formatCompilerMs(metrics.gpuP95)} ms`);
            lines.push(`- Estimated draws: ${metrics.draws ?? 'unavailable'}; target switches: ${metrics.targetSwitches ?? 'unavailable'}`);
            lines.push(`- Pixel-pass GPU share: ${Number.isFinite(Number(metrics.pixelPassShare)) ? round(Number(metrics.pixelPassShare) * 100, 1) : 'unavailable'}%`);
            lines.push(`- Shadow GPU share: ${Number.isFinite(Number(metrics.shadowPassShare)) ? round(Number(metrics.shadowPassShare) * 100, 1) : 'unavailable'}%`, '');
        }
        if (summary.studioPostQuality) {
            const quality = summary.studioPostQuality;
            const diagnostics = quality.diagnostics || {};
            const ao = diagnostics.ambientOcclusion || {};
            const bloom = diagnostics.bloomProfile || {};
            const failedChecks = (quality.contract?.checks || [])
                .filter(check => check?.passed !== true)
                .map(check => check.id);
            lines.push('## Studio AO/Bloom maximum quality', '');
            lines.push(`- Status: ${quality.status}`);
            lines.push(`- AO: requested ${ao.requestedQuality || 'unknown'} -> runtime ${ao.quality || 'unknown'}, scale ${ao.scale ?? 'unknown'}, ${ao.effectiveSPP ?? 'unknown'} SPP, hierarchy ${ao.hierarchyLevels ?? 'unknown'}`);
            lines.push(`- Bloom: requested ${diagnostics.bloomRequestedQuality || 'unknown'} -> runtime ${diagnostics.bloomRuntimeQuality || 'unknown'}, scale ${bloom.scale ?? 'unknown'}, ${bloom.downsampleKernel || 'unknown'} / ${bloom.upsampleKernel || 'unknown'}`);
            lines.push(`- Source path: ${diagnostics.bloomSourceMode || 'unknown'}`);
            lines.push(`- Failed checks: ${failedChecks.length ? failedChecks.join(', ') : 'none'}`, '');
        }
        if (summary.studioPostBenchmark) {
            const benchmark = summary.studioPostBenchmark;
            lines.push('## Complete Studio AO/Bloom benchmark', '');
            lines.push(`- Status: ${benchmark.status}`);
            lines.push(`- Cases: ${benchmark.cases.length}; passed: ${benchmark.cases.filter(item => item.status === 'passed').length}`, '');
            lines.push('| Case | Resolution | Samples | AO | Bloom | Tile render ms | Total ms | AO GPU p95 | Contract |', '|---|---|---:|---|---|---:|---:|---:|---|');
            benchmark.cases.forEach(item => {
                lines.push(`| ${item.kind}${item.reuse ? ' reuse' : ''} | ${(item.resolution || []).join('x')} | ${item.samples} | ${item.aoEnabled ? 'ON' : 'OFF'} | ${item.bloomEnabled ? 'ON' : 'OFF'} | ${formatCompilerMs(item.tileRenderMs)} | ${formatCompilerMs(item.totalMs)} | ${formatCompilerMs(item.aoGpuMsP95)} | ${item.contractPassed === null ? 'n/a' : (item.contractPassed ? 'pass' : 'fail')} |`);
            });
            if (benchmark.featureCosts.length) {
                lines.push('', '| 1080p 1x feature | Render ms | Delta vs baseline | Overhead | AO GPU p95 | Bloom draws |', '|---|---:|---:|---:|---:|---:|');
                benchmark.featureCosts.forEach(item => {
                    lines.push(`| ${item.kind} | ${formatCompilerMs(item.renderMs)} | ${formatCompilerMs(item.renderDeltaMs)} | ${item.overheadPercent ?? 'n/a'}% | ${formatCompilerMs(item.aoGpuMsP95)} | ${item.bloomDrawCalls ?? 'n/a'} |`);
                });
            }
            if (benchmark.sampleScaling.length) {
                lines.push('', '| Sample scaling | Low | High | Time ratio |', '|---|---:|---:|---:|');
                benchmark.sampleScaling.forEach(item => {
                    lines.push(`| ${item.resolutionClass} | ${item.lowSamples}x / ${formatCompilerMs(item.lowRenderMs)} ms | ${item.highSamples}x / ${formatCompilerMs(item.highRenderMs)} ms | ${item.timeRatio}x |`);
                });
            }
            if (benchmark.resolutionScaling.length) {
                lines.push('', '| Resolution scaling | Low | High | Pixel ratio | Time ratio | Exponent |', '|---|---|---|---:|---:|---:|');
                benchmark.resolutionScaling.forEach(item => {
                    lines.push(`| ${item.samples}x samples | ${(item.lowResolution || []).join('x')} | ${(item.highResolution || []).join('x')} | ${item.pixelRatio}x | ${item.timeRatio}x | ${item.scalingExponent ?? 'n/a'} |`);
                });
            }
            if (benchmark.reuse.length) {
                lines.push('', '| Prepared reuse | Cold total | Warm total | Speedup | Cold prepare | Warm prepare |', '|---|---:|---:|---:|---:|---:|');
                benchmark.reuse.forEach(item => {
                    lines.push(`| ${item.samples}x | ${formatCompilerMs(item.coldTotalMs)} | ${formatCompilerMs(item.warmTotalMs)} | ${item.speedup ?? 'n/a'}x | ${formatCompilerMs(item.coldShaderPrepareMs)} | ${formatCompilerMs(item.warmShaderPrepareMs)} |`);
                });
            }
            lines.push('');
        }
        if (summary.studioScaling?.length) {
            lines.push('## Studio resolution scaling', '');
            lines.push('| Mode | Samples | Low | High | Pixel ratio | Render-time ratio | Exponent | Interpretation |', '|---|---:|---|---|---:|---:|---:|---|');
            summary.studioScaling.forEach(item => {
                lines.push(`| ${item.mode || 'unknown'} | ${item.samples ?? 1}x | ${(item.lowResolution || []).join('x')} | ${(item.highResolution || []).join('x')} | ${item.pixelRatio}x | ${item.timeRatio}x | ${item.scalingExponent ?? ''} | ${item.interpretation} |`);
            });
            lines.push('');
        }
        if (summary.rendercraftCompiler) {
            const compiler = summary.rendercraftCompiler;
            const coldScene = compiler.coldSceneWarmup;
            lines.push('## Rendercraft compiler', '');
            lines.push(`- Family: ${compiler.family || 'unavailable'}${compiler.pass ? ` (${compiler.pass})` : ''}`);
            lines.push(`- Generated source: ${compiler.vertexChars ?? 'unavailable'} vertex chars + ${compiler.fragmentChars ?? 'unavailable'} fragment chars`);
            lines.push(`- Warm-up maximum injected source: ${compiler.warmupMaxSourceChars ?? 'unavailable'} total chars / ${compiler.warmupMaxFragmentChars ?? 'unavailable'} fragment chars`);
            lines.push(`- Source cache: ${compiler.sourceFamilies ?? 'unavailable'} families, ${compiler.cacheHits ?? 'unavailable'} hits, ${compiler.cacheMisses ?? 'unavailable'} misses (${compiler.sourceAssembly || 'assembly unknown'})`);
            if (compiler.dynamicLightLoop !== null && compiler.dynamicLightLoop !== undefined) {
                lines.push(`- Light topology program model: ${compiler.dynamicLightLoop ? 'dynamic compact loop (16-slot capacity)' : 'compatibility slot buckets (1/2/4/8/16)'}`);
            }
            lines.push(`- Theoretical variants: ${compiler.theoreticalBeautyFamilies ?? 'unavailable'} beauty / ${compiler.theoreticalBloomFamilies ?? 'unavailable'} bloom`);
            if (coldScene) {
                lines.push(`- Cold scene warm-up: ${formatCompilerMs(coldScene.durationMs)} ms total / ${formatCompilerMs(coldScene.schedulerWallMs)} ms scheduler, ${coldScene.programFamilyCount ?? 'unavailable'} program families, concurrency ${coldScene.concurrency ?? 'unavailable'}`);
                lines.push(`- Cold scene work: ${coldScene.unitCount ?? 'unavailable'} units, program delta ${coldScene.programDelta ?? 'unavailable'}, peak pending ${coldScene.peakPendingPrograms ?? 'unavailable'}`);
                lines.push(`- Exact live prime: ${formatCompilerMs(coldScene.liveScenePrimeMs)} ms / program delta ${coldScene.liveScenePrimeProgramDelta ?? 'unavailable'}; auxiliary prime: ${formatCompilerMs(coldScene.auxiliaryPrimeMs)} ms / program delta ${coldScene.auxiliaryPrimeProgramDelta ?? 'unavailable'} / ${coldScene.auxiliaryPrimeUnitCount ?? 'unavailable'} compile contexts / ${coldScene.auxiliaryPrimeProgramFamilyCount ?? 'unavailable'} program families / ${coldScene.auxiliaryPrimeMaterialCount ?? 'unavailable'} materials${coldScene.auxiliaryPrimeCacheHit ? ' / exact cache hit' : ''}`);
                if (coldScene.slowestUnits?.length) {
                    lines.push('', '| Slow unit | Type | Shader | Material | Duration ms | Program delta scope | Fragment chars |', '|---|---|---|---|---:|---:|---:|');
                    coldScene.slowestUnits.forEach(unit => {
                        const programScope = unit.programDeltaAttribution === 'shared_concurrent_window'
                            ? 'shared'
                            : unit.programDeltaAttribution === 'exclusive_unit'
                                ? 'exclusive'
                                : 'unknown';
                        lines.push(`| ${(unit.label || 'unknown').replace(/\|/g, '\\|')} | ${unit.type || ''} | ${unit.shaderId || ''} | ${(unit.materialName || '').replace(/\|/g, '\\|')} | ${formatCompilerMs(unit.durationMs)} | ${unit.programDelta ?? ''} (${programScope}) | ${unit.fragmentLength ?? ''} |`);
                    });
                }
            }
            lines.push('');
        }
        if (summary.integrity) {
            lines.push('## Resource integrity', '');
            lines.push(`- Status: ${summary.integrity.status}`);
            lines.push(`- Program growth: ${summary.integrity.resourceGrowth?.programs ?? 'unavailable'}`);
            lines.push(`- Texture growth: ${summary.integrity.resourceGrowth?.textures ?? 'unavailable'}`);
            lines.push(`- Geometry growth: ${summary.integrity.resourceGrowth?.geometries ?? 'unavailable'}`, '');
        }
        if (summary.sceneScalability) {
            const scalability = summary.sceneScalability;
            const performance = scalability.performance || {};
            lines.push('## Scene scalability', '');
            lines.push(`- Status: ${scalability.status}; temporary cubes: ${scalability.createdCubeCount ?? 'unavailable'}`);
            lines.push(`- Static batches: ${performance.renderBatches ?? 'unavailable'}; batched members: ${performance.renderBatchMembers ?? 'unavailable'}; saved draws: ${performance.savedRenderDraws ?? 'unavailable'}`);
            lines.push(`- Dynamic batches: ${performance.dynamicInstanceBatches ?? 'unavailable'}; instances: ${performance.dynamicInstances ?? 'unavailable'}; saved draws: ${performance.savedDynamicInstanceDraws ?? 'unavailable'}`);
            lines.push(`- Estimated scene draws/frame: ${performance.estimatedSceneDrawsPerFrame ?? 'unavailable'}`);
            lines.push(`- Structural warm-up: ${formatCompilerMs(scalability.warmup?.durationMs)} ms; exact live prime: ${formatCompilerMs(scalability.warmup?.liveScenePrimeMs)} ms / program delta ${scalability.warmup?.liveScenePrimeProgramDelta ?? 'unavailable'}`, '');
            if (scalability.drawScaling?.length) {
                lines.push('| Objects | Frame p95 ms | Estimated draws | Rendered FPS | Mode | Cell | Hide sources | CPU p95 | GPU p95 | Top CPU pass | Unattributed interval | Static batches | Saved draws | GPU drain | Decision |', '|---:|---:|---:|---:|---|---:|---|---:|---:|---|---:|---:|---:|---|---|');
                scalability.drawScaling.forEach(point => {
                    const topCpuPass = point.analysis?.topCpuPasses?.[0];
                    const topCpuLabel = topCpuPass
                        ? `${topCpuPass.name}: ${topCpuPass.p95Ms} ms`
                        : '';
                    lines.push(`| ${point.objects} | ${point.analysis?.frameP95Ms ?? point.frameTiming?.p95Ms ?? ''} | ${point.performance?.estimatedSceneDrawsPerFrame ?? ''} | ${point.renderThroughput?.effectiveFps ?? ''} | ${point.mode || ''} | ${point.batchCellSize ?? ''} | ${point.hideSuppressedSources === true ? 'yes' : 'no'} | ${point.analysis?.cpuP95Ms ?? ''} | ${point.analysis?.gpuP95Ms ?? ''} | ${topCpuLabel.replace(/\|/g, '\\|')} | ${point.analysis?.unattributedFrameIntervalMs ?? ''} | ${point.performance?.renderBatches ?? ''} | ${point.performance?.savedRenderDraws ?? ''} | ${point.gpuDrain?.reason || ''} | ${point.analysis?.decision || point.limiter?.id || ''} |`);
                });
                lines.push('');
                const finalObjects = Math.max(...scalability.drawScaling.map(point => Number(point.objects) || 0));
                const finalPoints = scalability.drawScaling.filter(point => Number(point.objects) === finalObjects);
                if (finalPoints.some(point => point.performance?.batchingDiagnostics)) {
                    lines.push('| Mode | Cell | Draw reduction | Eligible coverage | Minimum groups | Merge failures | Largest group draws | Eligibility blockers |', '|---|---:|---:|---:|---:|---:|---:|---|');
                    finalPoints.forEach(point => {
                        const diagnostics = point.performance?.batchingDiagnostics || {};
                        const blockers = Object.entries(diagnostics.eligibilityBlockerDraws || {})
                            .sort((left, right) => Number(right[1]) - Number(left[1]))
                            .slice(0, 5)
                            .map(([reason, draws]) => `${reason}: ${draws}`)
                            .join(', ');
                        const reduction = Number.isFinite(Number(diagnostics.totalDrawReduction))
                            ? `${round(Number(diagnostics.totalDrawReduction) * 100, 1)}%`
                            : '';
                        const coverage = Number.isFinite(Number(diagnostics.eligibleDrawCoverage))
                            ? `${round(Number(diagnostics.eligibleDrawCoverage) * 100, 1)}%`
                            : '';
                        lines.push(`| ${point.mode || ''} | ${point.batchCellSize ?? ''} | ${reduction} | ${coverage} | ${diagnostics.minimumGroups ?? ''} | ${diagnostics.mergeFailedGroups ?? ''} | ${diagnostics.largestGroupSourceDraws ?? ''} | ${blockers.replace(/\|/g, '\\|')} |`);
                    });
                    lines.push('');
                }
            }
        }
        if (summary.projectSwitching) {
            lines.push('## Project switching', '');
            lines.push(`- Status: ${summary.projectSwitching.status}; open projects: ${summary.projectSwitching.openProjects.length}`);
            lines.push('| Kind | Reuse | Iteration | Project | Select call ms | Active ms | Hydrated ms | Warm-up ms | First frame ms | Settled ms |', '|---|---|---:|---|---:|---:|---:|---:|---:|---:|');
            summary.projectSwitching.settledSwitches.forEach(item => {
                lines.push(`| ${item.kind || ''} | ${item.resourceReuse === true ? 'on' : 'off'} | ${item.iteration ?? ''} | ${(item.projectName || item.projectId || '').replace(/\|/g, '\\|')} | ${item.selectCallMs ?? ''} | ${item.milestones?.projectActiveMs ?? ''} | ${item.milestones?.hydrationCompleteMs ?? ''} | ${item.milestones?.warmupReadyMs ?? ''} | ${item.milestones?.firstRenderedFrameMs ?? ''} | ${item.milestones?.settledMs ?? ''} |`);
            });
            summary.projectSwitching.rapidSwitches.forEach(item => {
                lines.push(`| ${item.kind || 'rapid'} | ${item.resourceReuse === true ? 'on' : 'off'} |  | ${(item.projectName || item.projectId || '').replace(/\|/g, '\\|')} | ${item.dispatchMs ?? ''} | ${item.milestones?.projectActiveMs ?? ''} | ${item.milestones?.hydrationCompleteMs ?? ''} | ${item.milestones?.warmupReadyMs ?? ''} | ${item.milestones?.firstRenderedFrameMs ?? ''} | ${item.milestones?.settledMs ?? ''} |`);
            });
            lines.push('');
        }
        if (summary.animationMatrix?.length) {
            lines.push('## Maximum animation matrix', '');
            lines.push('| Mode | State | Status | Visible FPS | Logical renders/s | Render/RAF | p95 ms | p99 ms | 1% low FPS | Pacing tier | Miss 144 | Animator p95 | CPU p95 | GPU p95 | AO eval/reuse | Rim eval/reuse | Matrix upload | Pose CPU total | Host render reuse | Extra render requests | Shadow invalidations | Rebuilds | Top pass |', '|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|');
            summary.animationMatrix.forEach(item => {
                const topPass = item.topGpuPass || item.topCpuPass;
                const topPassLabel = topPass ? `${topPass.name}: ${round(topPass.p95Ms)} ms` : '';
                const aoCadence = item.aoCadence
                    ? `${item.aoCadence.evaluatedSignatures ?? 0}/${item.aoCadence.reusedSignatures ?? 0}`
                    : '';
                const rimCadence = item.rimCadence
                    ? `${item.rimCadence.evaluatedMasks ?? 0}/${item.rimCadence.reusedMasks ?? 0}`
                    : '';
                lines.push(`| ${item.mode || ''} | ${item.state || ''} | ${item.status} | ${item.visibleFps ?? ''} | ${item.logicalRenderFps ?? ''} | ${item.renderToRafRatio ?? ''} | ${item.p95Ms ?? ''} | ${item.p99Ms ?? ''} | ${item.onePercentLowFps ?? ''} | ${item.pacingTier ?? ''} | ${item.missed144Ratio ?? ''} | ${item.animatorPreviewP95Ms ?? ''} | ${item.cpuP95Ms ?? ''} | ${item.gpuP95Ms ?? ''} | ${aoCadence} | ${rimCadence} | ${item.runtime?.totalMatrixBytesUploaded ?? item.runtime?.matrixBytesUploaded ?? ''} | ${item.runtime?.poseCpuTotalMs ?? ''} | ${item.runtime?.hostRenderReuses ?? ''} | ${item.runtime?.scheduledPreviewRenders ?? ''} | ${item.runtime?.shadowInvalidations ?? ''} | ${item.runtime?.structuralRebuildsDuringPose ?? ''} | ${topPassLabel.replace(/\|/g, '\\|')} |`);
            });
            lines.push('');
        }
        if (summary.editVsAnimation) {
            lines.push('## Edit transform vs animation', '');
            lines.push(`- Edit p95: ${summary.editVsAnimation.editP95Ms} ms`);
            lines.push(`- Animation p95: ${summary.editVsAnimation.animationP95Ms} ms`);
            lines.push(`- Edit/animation p95 ratio: ${summary.editVsAnimation.p95Ratio}x`);
            lines.push(`- Edit transform update-call p95: ${summary.editVsAnimation.editTransformUpdateP95Ms ?? ''} ms`, '');
        }
        if (summary.featureCosts?.length) {
            lines.push('## Pass isolation cost', '');
            lines.push('| Pass | ON p95 | OFF p95 | Delta ms | Delta % |', '|---|---:|---:|---:|---:|');
            summary.featureCosts.forEach(item => {
                const delta = item.reliable === false ? 'unreliable' : item.p95DeltaMs;
                const deltaPct = item.reliable === false ? item.reason : `${item.p95DeltaPct ?? ''}%`;
                lines.push(`| ${item.pass} | ${item.onP95Ms} | ${item.offP95Ms} | ${delta} | ${deltaPct} |`);
            });
            lines.push('');
        }
        if (summary.modeMatrix?.length) {
            lines.push('## Render mode matrix', '');
            lines.push('| Fixture | Mode | p95 ms | Worst ms | FPS | Programs |', '|---|---|---:|---:|---:|---:|');
            summary.modeMatrix.forEach(item => {
                lines.push(`| ${item.fixture} | ${item.mode} | ${item.p95Ms} | ${item.worstMs} | ${item.effectiveFps} | ${item.programs ?? ''} |`);
            });
            lines.push('');
        }
        if (summary.studio?.length) {
            lines.push('## Studio Render', '');
            lines.push('| Scenario | Status | Total ms | Tile ms | Composite ms | Encode ms | Tiles |', '|---|---|---:|---:|---:|---:|---:|');
            summary.studio.forEach(item => {
                lines.push(`| ${item.id} | ${item.status} | ${item.totalMs ?? ''} | ${item.tileRenderMs ?? ''} | ${item.finalCompositeMs ?? ''} | ${item.encodeMs ?? ''} | ${item.tileCount ?? ''} |`);
            });
            lines.push('');
        }
        const workflowScenarios = (report.scenarios || []).filter(scenario => scenario.workflow);
        if (workflowScenarios.length) {
            lines.push('## Current-scene workflow A/B', '');
            lines.push('Same scene, camera and material settings; passive host rendering. CPU mode is diagnostic, not a normal-throughput baseline.', '');
            lines.push('| Scenario | Status | RAF FPS | Render FPS | Render/RAF | CPU p95 ms | GPU p95 ms | Reused requests |',
                '|---|---|---:|---:|---:|---:|---:|---:|');
            workflowScenarios.forEach(scenario => {
                const throughput = scenario.renderThroughput || {};
                const statistics = scenario.profilerStatistics || {};
                lines.push(`| ${scenario.id} | ${scenario.status} | ${scenario.frameTiming?.activeEffectiveFps ?? 'n/a'} | ${throughput.effectiveFps ?? 'n/a'} | ${throughput.renderToRafRatio ?? 'n/a'} | ${statistics.frameCpu?.p95 ?? 'n/a'} | ${statistics.frameGpu?.p95 ?? 'n/a'} | ${scenario.workflow.schedulingDelta?.reused ?? 'n/a'} |`);
            });
            lines.push('');
            if (workflowScenarios.some(scenario => scenario.workflow.comparison === 'art_key_frame_cache')) {
                lines.push('| Scenario | Art Key cache | Prepared keys | Object resolutions | Cached resolutions |',
                    '|---|---|---:|---:|---:|');
                workflowScenarios.forEach(scenario => {
                    const delta = scenario.workflow.artKeyDelta || {};
                    lines.push(`| ${scenario.id} | ${scenario.workflow.artKeyCacheEnabled ? 'on' : 'off'} | ${delta.preparedKeys ?? 'n/a'} | ${delta.resolutions ?? 'n/a'} | ${delta.cacheHits ?? 'n/a'} |`);
                });
                lines.push('');
            }
            if (workflowScenarios.some(scenario => scenario.workflow.comparison === 'art_key_batching')) {
                lines.push('| Scenario | Art Key batching | Batches | Members | Saved draws | Membership checks | Splits |',
                    '|---|---|---:|---:|---:|---:|---:|');
                workflowScenarios.forEach(scenario => {
                    const batch = scenario.workflow.batching || {};
                    lines.push(`| ${scenario.id} | ${scenario.workflow.artKeyBatchingEnabled ? 'on' : 'off'} | ${batch.batches ?? 'n/a'} | ${batch.members ?? 'n/a'} | ${batch.savedDraws ?? 'n/a'} | ${batch.delta?.memberChecks ?? 'n/a'} | ${batch.delta?.splits ?? 'n/a'} |`);
                });
                lines.push('');
            }
        }
        lines.push('## Slowest scenarios by frame p95', '');
        lines.push('| Scenario | p95 ms | Active worst ms | Active FPS | Scheduler pauses |', '|---|---:|---:|---:|---:|');
        summary.slowestByP95.forEach(item => {
            lines.push(`| ${item.label.replace(/\|/g, '\\|')} | ${item.p95Ms} | ${item.worstMs} | ${item.effectiveFps} | ${item.schedulerPauseCount || 0} |`);
        });
        lines.push('', '## All scenarios', '');
        lines.push('| ID | Status | Mode | Active FPS | p95 ms | Active worst ms | Pauses | WebGL |', '|---|---|---|---:|---:|---:|---:|---:|');
        (report.scenarios || []).forEach(s => {
            const timing = s.frameTiming || {};
            const hasPause = (timing.schedulerPauseCount || 0) > 0;
            lines.push(`| ${s.id} | ${s.status} | ${s.mode || ''} | ${hasPause ? timing.activeEffectiveFps : (timing.effectiveFps ?? '')} | ${timing.p95Ms ?? ''} | ${hasPause ? timing.activeWorstMs : (timing.worstMs ?? '')} | ${timing.schedulerPauseCount || 0} | ${s.webglErrorsAfter?.length ?? 0} |`);
        });
        return lines.join('\n');
    }

    function downsampleForExport(values, limit) {
        if (!Array.isArray(values)) return [];
        const max = Math.max(1, Number(limit) || 1);
        if (values.length <= max) return values.slice();
        const output = [];
        const last = values.length - 1;
        for (let index = 0; index < max; index++) {
            output.push(values[Math.round(index * last / Math.max(1, max - 1))]);
        }
        return output;
    }

    function buildPortableReport(report) {
        const exportAudit = {
            originalScenarioCount: report.scenarios?.length || 0,
            originalEventCount: report.events?.length || 0,
            originalConsoleCount: report.console?.length || 0,
            originalRuntimeErrorCount: report.runtimeErrors?.length || 0,
            telemetry: []
        };
        const scenarios = (report.scenarios || []).map(scenario => {
            const telemetry = downsampleForExport(scenario.telemetry || [], 200);
            const frameDeltasMs = downsampleForExport(scenario.frameDeltasMs || [], 200);
            const frameTimestampsMs = downsampleForExport(scenario.frameTimestampsMs || [], 200);
            if (telemetry.length !== (scenario.telemetry?.length || 0)) {
                exportAudit.telemetry.push({
                    id: scenario.id,
                    original: scenario.telemetry.length,
                    exported: telemetry.length
                });
            }
            return toSerializable({ ...scenario, telemetry, frameDeltasMs, frameTimestampsMs });
        });
        return {
            schema: report.schema,
            schemaVersion: report.schemaVersion,
            labVersion: report.labVersion,
            runId: report.runId,
            startedAt: report.startedAt,
            finishedAt: report.finishedAt,
            durationMs: report.durationMs,
            config: toSerializable(report.config),
            environment: toSerializable(report.environment),
            initial: toSerializable(report.initial),
            final: toSerializable(report.final),
            hostInitial: toSerializable(report.hostInitial),
            afterCleanup: toSerializable(report.afterCleanup),
            projectLifecycle: toSerializable(report.projectLifecycle),
            cleanupErrors: toSerializable(report.cleanupErrors || []),
            cancelled: report.cancelled === true,
            shaderCompilation: toSerializable(report.shaderCompilation),
            workflowOperations: toSerializable(report.workflowOperations),
            sessionPacing: report.sessionPacing ? {
                source: report.sessionPacing.source,
                sampleCount: report.sessionPacing.samples.length,
                fullSamplesFile: 'performance-frames.json'
            } : null,
            initialWebGLErrors: toSerializable(report.initialWebGLErrors || []),
            scenarios,
            events: toSerializable(downsampleForExport(report.events || [], 6000)),
            console: toSerializable(downsampleForExport(report.console || [], 4000)),
            runtimeErrors: toSerializable(downsampleForExport(report.runtimeErrors || [], 500)),
            contextEvents: toSerializable(report.contextEvents || []),
            progressEvents: toSerializable(downsampleForExport(report.progressEvents || [], 1200)),
            progress: toSerializable(report.progress),
            projectLoadCapture: toSerializable(report.projectLoadCapture),
            fatalError: toSerializable(report.fatalError),
            summary: toSerializable(report.summary),
            performanceDiagnostics: toSerializable(report.performanceDiagnostics),
            attachments: {},
            exportAudit
        };
    }

    async function exportReport(report, options = {}) {
        if (!report) throw new Error('No Lightflow Test Lab report is available.');
        if (typeof root.JSZip !== 'function') throw new Error('JSZip is unavailable in this Blockbench build.');
        const zip = new root.JSZip();
        const summary = report.summary || buildReportSummary(report);
        const manifest = {
            schema: report.schema,
            schemaVersion: report.schemaVersion,
            labVersion: report.labVersion,
            runId: report.runId,
            startedAt: report.startedAt,
            finishedAt: report.finishedAt,
            platform: report.environment?.platform?.isApp ? 'desktop' : 'web',
            blockbenchVersion: report.environment?.host?.blockbenchVersion || null,
            threeRevision: report.environment?.host?.threeRevision || null,
            summary
        };
        const reportJson = buildPortableReport(report);
        Object.entries(report.attachments || {}).forEach(([name, dataUrl]) => {
            if (typeof dataUrl !== 'string') return;
            const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
            if (!match) return;
            zip.file(`screenshots/${name}`, match[1], { base64: true });
            reportJson.attachments[name] = { path: `screenshots/${name}`, mime: 'image/png' };
        });
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));
        zip.file('report.json', JSON.stringify(reportJson, null, 2));
        zip.file('summary.csv', reportToCsv(report));
        zip.file('summary.md', reportToMarkdown(report));
        if (report.workflowOperations) zip.file('workflow-operations.json', JSON.stringify(report.workflowOperations, null, 2));
        if (report.performanceDiagnostics) {
            zip.file('performance-diagnostics.json', JSON.stringify(report.performanceDiagnostics, null, 2));
            zip.file('performance-frames.json', JSON.stringify(report.performanceDiagnostics.frameSamples || [], null, 2));
            if (report.shaderCompilation) zip.file('shader-compilation.json', JSON.stringify(report.shaderCompilation, null, 2));
            zip.file('project-lifecycle.json', JSON.stringify({
                ...(report.projectLifecycle || {}), cleanupErrors: report.cleanupErrors || [], cancelled: report.cancelled === true,
                hostInitial: report.hostInitial, afterCleanup: report.afterCleanup
            }, null, 2));
            zip.file('performance-frames.csv', performanceFramesToCsv(report));
        }
        zip.file('environment.json', JSON.stringify(report.environment || {}, null, 2));
        zip.file('events.json', JSON.stringify(report.events || [], null, 2));
        zip.file('console.json', JSON.stringify(report.console || [], null, 2));
        zip.file('runtime-errors.json', JSON.stringify(report.runtimeErrors || [], null, 2));
        zip.file('progress.json', JSON.stringify({ final: report.progress || null, events: report.progressEvents || [] }, null, 2));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const safeName = `${report.runId}.zip`.replace(/[^a-zA-Z0-9._-]+/g, '_');

        if (root.isApp && options.forceBrowser !== true) {
            const written = await tryWriteDesktopReport(blob, safeName, options);
            if (written) return { method: 'desktop_fs', path: written, name: safeName, size: blob.size };
        }
        const downloaded = triggerBrowserDownload(blob, safeName);
        if (downloaded) return { method: 'browser_download', name: safeName, size: blob.size };

        if (root.Blockbench?.export) {
            const dataUrl = await blobToDataUrl(blob);
            root.Blockbench.export({
                resource_id: 'lightflow_test_lab',
                extensions: ['zip'],
                type: 'Lightflow Test Report',
                savetype: 'zip',
                name: safeName.replace(/\.zip$/i, ''),
                content: dataUrl
            });
            return { method: 'blockbench_export', name: safeName, size: blob.size };
        }
        throw new Error('No report export method is available.');
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Blob conversion failed.'));
            reader.readAsDataURL(blob);
        });
    }

    function triggerBrowserDownload(blob, name) {
        if (!root.document?.createElement || !root.URL?.createObjectURL) return false;
        try {
            const url = root.URL.createObjectURL(blob);
            const anchor = root.document.createElement('a');
            anchor.href = url;
            anchor.download = name;
            anchor.style.display = 'none';
            root.document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => root.URL.revokeObjectURL(url), 3000);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function tryWriteDesktopReport(blob, fileName, options = {}) {
        try {
            if (typeof require !== 'function') return null;
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const baseDir = options.directory || path.join(os.homedir(), 'Downloads', 'Lightflow Benchmarks');
            fs.mkdirSync(baseDir, { recursive: true });
            const buffer = Buffer.from(await blob.arrayBuffer());
            const destination = path.join(baseDir, fileName);
            fs.writeFileSync(destination, buffer);
            console.info(`[Lightflow Test Lab] Report exported to ${destination}`);
            return destination;
        } catch (error) {
            console.warn('[Lightflow Test Lab] Automatic desktop export failed; falling back to browser/Blockbench export.', error);
            return null;
        }
    }

    function loadStoredConfig() {
        try {
            const raw = root.localStorage?.getItem?.(STORAGE_KEY);
            return raw ? normalizeConfig(JSON.parse(raw)) : normalizeConfig({});
        } catch (error) {
            return normalizeConfig({});
        }
    }

    function saveStoredConfig(config) {
        const normalized = normalizeConfig(config);
        try { root.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(normalized)); } catch (error) {}
        return normalized;
    }

    let activeRunner = null;
    let lastReport = null;
    let projectLoadListener = null;
    let projectLoadStartedAt = null;
    let projectLoadEvents = [];
    let armedLoadCapture = null;

    class ArmedLoadCapture {
        constructor() {
            this.startedAtIso = wallIso();
            this.startedAt = now();
            this.frameDeltasMs = [];
            this.diagnostics = [];
            this.console = [];
            this.contextEvents = [];
            this.running = false;
            this.rafId = null;
            this.previousRaf = null;
            this.lastDiagnosticAt = -Infinity;
            this.lastDiagnosticSignature = '';
            this.consoleOriginals = {};
            this.contextBindings = [];
            this.coldWarmup = null;
        }
        start() {
            if (this.running) return;
            this.running = true;
            ['warn', 'error'].forEach(level => {
                const original = root.console?.[level]?.bind?.(root.console);
                if (!original) return;
                this.consoleOriginals[level] = original;
                root.console[level] = (...args) => {
                    this.console.push({
                        atMs: round(now() - this.startedAt),
                        level,
                        text: args.map(arg => typeof arg === 'string' ? arg : (arg?.message || safe(() => JSON.stringify(toSerializable(arg)), String(arg)))).join(' ')
                    });
                    original(...args);
                };
            });
            const boundCanvases = new Set();
            (root.Preview?.all || []).forEach(preview => {
                const canvas = preview?.renderer?.domElement;
                if (!canvas?.addEventListener || boundCanvases.has(canvas)) return;
                boundCanvases.add(canvas);
                const lost = () => this.contextEvents.push({ atMs: round(now() - this.startedAt), type: 'lost' });
                const restored = () => this.contextEvents.push({ atMs: round(now() - this.startedAt), type: 'restored' });
                canvas.addEventListener('webglcontextlost', lost, false);
                canvas.addEventListener('webglcontextrestored', restored, false);
                this.contextBindings.push({ canvas, lost, restored });
            });
            const tick = timestamp => {
                if (!this.running) return;
                const current = Number(timestamp) || now();
                if (this.previousRaf !== null) this.frameDeltasMs.push(Math.max(0, current - this.previousRaf));
                this.previousRaf = current;
                const elapsed = now() - this.startedAt;
                const warmup = getWarmupState();
                const signature = `${warmup.state}|${warmup.programs}|${warmup.pendingPrograms}|${warmup.activeJobs}|${warmup.failed}`;
                if (signature !== this.lastDiagnosticSignature || elapsed - this.lastDiagnosticAt >= 250) {
                    this.diagnostics.push({
                        atMs: round(elapsed),
                        warmup: toSerializable(warmup),
                        renderer: getRendererSnapshot(),
                        bedrockStructure: toSerializable(root.BedrockStructureStudio?.getPerformanceDiagnostics?.() || null)
                    });
                    this.lastDiagnosticSignature = signature;
                    this.lastDiagnosticAt = elapsed;
                }
                this.rafId = requestAnimationFrame(tick);
            };
            if (typeof requestAnimationFrame === 'function') this.rafId = requestAnimationFrame(tick);
        }
        stop() {
            if (!this.running) return this.snapshot();
            this.running = false;
            if (this.rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
            Object.entries(this.consoleOriginals).forEach(([level, original]) => {
                if (original) root.console[level] = original;
            });
            this.consoleOriginals = {};
            this.contextBindings.forEach(binding => {
                try {
                    binding.canvas.removeEventListener('webglcontextlost', binding.lost, false);
                    binding.canvas.removeEventListener('webglcontextrestored', binding.restored, false);
                } catch (error) {}
            });
            this.contextBindings = [];
            return this.snapshot();
        }
        snapshot() {
            return {
                startedAt: this.startedAtIso,
                durationMs: round(now() - this.startedAt),
                frameTiming: summarizeFrameDeltas(this.frameDeltasMs, now() - this.startedAt),
                frameDeltasMs: this.frameDeltasMs.slice(),
                diagnostics: this.diagnostics.slice(),
                coldWarmup: toSerializable(this.coldWarmup),
                console: this.console.slice(),
                contextEvents: this.contextEvents.slice()
            };
        }
    }

    async function runSuite(config = {}) {
        if (activeRunner?.running) throw new Error('A Lightflow Test Lab suite is already running.');
        const merged = normalizeConfig({ ...loadStoredConfig(), ...config });
        saveStoredConfig(merged);
        activeRunner = new TestRunner(merged);
        const preLoadSnapshot = armedLoadCapture?.stop?.() || null;
        armedLoadCapture = null;
        const report = await activeRunner.run();
        if (projectLoadEvents.length || preLoadSnapshot) {
            report.projectLoadCapture = {
                startedAt: projectLoadStartedAt || preLoadSnapshot?.startedAt || null,
                events: projectLoadEvents.slice(),
                preSuite: preLoadSnapshot
            };
            projectLoadEvents = [];
            projectLoadStartedAt = null;
            report.summary = buildReportSummary(report);
        }
        lastReport = report;
        root.Blockbench?.showQuickMessage?.(`Lightflow Test Lab: ${report.summary?.failed || 0} failed, ${report.summary?.skipped || 0} skipped`);
        if (merged.autoExport) {
            try { report.export = await exportReport(report); }
            catch (error) {
                report.exportError = toSerializable(error);
                console.error('[Lightflow Test Lab] Automatic report export failed.', error);
            }
        }
        return report;
    }

    function cancelSuite() {
        activeRunner?.cancel?.();
    }

    function armNextProjectLoad(config = {}) {
        const merged = normalizeConfig({ ...loadStoredConfig(), ...config });
        saveStoredConfig(merged);
        try { root.localStorage?.setItem?.(ARM_KEY, JSON.stringify({ armedAt: wallIso(), config: merged })); } catch (error) {}
        root.Blockbench?.showQuickMessage?.('Lightflow Test Lab armed. Open the benchmark project now.');
        return true;
    }

    function disarmNextProjectLoad() {
        try { root.localStorage?.removeItem?.(ARM_KEY); } catch (error) {}
        projectLoadEvents = [];
        projectLoadStartedAt = null;
        armedLoadCapture?.stop?.();
        armedLoadCapture = null;
    }

    function getArmedConfig() {
        try {
            const raw = root.localStorage?.getItem?.(ARM_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return normalizeConfig(parsed.config || {});
        } catch (error) {
            return null;
        }
    }

    function installProjectLoadAutomation() {
        if (!root.Blockbench?.on || projectLoadListener) return;
        const remember = (name, event) => {
            if (!getArmedConfig()) return;
            if (projectLoadStartedAt === null) projectLoadStartedAt = wallIso();
            if (!armedLoadCapture) {
                armedLoadCapture = new ArmedLoadCapture();
                armedLoadCapture.start();
            }
            projectLoadEvents.push({ at: wallIso(), name, detail: summarizeEventDetail(event) });
        };
        const refs = [
            root.Blockbench.on('load_project', event => remember('load_project', event)),
            root.Blockbench.on('select_project', async event => {
                remember('select_project', event);
                const config = getArmedConfig();
                if (!config) return;
                try { root.localStorage?.removeItem?.(ARM_KEY); } catch (error) {}
                await frames(2);

                // Keep the armed capture alive through the *actual* cold warm-up.
                // v1 stopped it immediately before scenario 00, leaving many reports
                // with a single RAF delta and no useful first-load distribution.
                const coldWarmup = await waitForWarmupStable(config);
                const capture = armedLoadCapture;
                if (capture) capture.coldWarmup = toSerializable(coldWarmup);
                const postReadyStartedAt = now();
                const minPostReadyMs = Math.max(0, Number(config.coldLoadPostReadyMs) || 1200);
                const minFrames = Math.max(2, Number(config.coldLoadMinFrames) || 60);
                const startFrameCount = capture?.frameDeltasMs?.length || 0;
                while (
                    capture &&
                    (
                        now() - postReadyStartedAt < minPostReadyMs ||
                        capture.frameDeltasMs.length - startFrameCount < minFrames
                    )
                ) {
                    await frames(1);
                }
                try { await runSuite(config); }
                catch (error) { console.error('[Lightflow Test Lab] Armed project-load suite failed.', error); }
            })
        ];
        projectLoadListener = { delete() { refs.forEach(ref => safe(() => ref?.delete?.(), null)); } };
    }

    function removeProjectLoadAutomation() {
        projectLoadListener?.delete?.();
        projectLoadListener = null;
    }

    function runPreset(preset, options = {}) {
        return runSuite({ ...DEFAULT_CONFIG, ...preset, ...(options || {}) });
    }

    const api = Object.freeze({
        version: LAB_VERSION,
        defaults: DEFAULT_CONFIG,
        modes: MODE_IDS,
        run: runSuite,
        runQuick: options => runPreset({
            suite: 'quick', includeStudio: false, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false, runFeatureIsolation: false,
            runNoOverridesFixture: false, scenarioDurationMs: 1000, settleDurationMs: 400,
        }, options),
        runSmoke: options => runPreset({
            suite: 'smoke', includeStudio: false, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false, runFeatureIsolation: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            scenarioDurationMs: 1200, settleDurationMs: 450,
        }, options),
        runShaderDiagnostics: options => runPreset({
            suite: 'shader_diagnostics', includeStudio: false, includeHeavyStudio: false,
            runModeCycle: true, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 900, settleDurationMs: 400,
        }, options),
        runRendercraftDiagnostics: options => runPreset({
            suite: 'rendercraft_diagnostics', includeStudio: false, includeHeavyStudio: false,
            runModeCycle: true, modeIds: ['cinematic_craft'],
            runOverrideModeCycle: false, runNoOverridesFixture: false,
            runInteractionPerMode: false, runFeatureToggles: false,
            runFeatureIsolation: false, runEditTransform: false,
            runAnimation: false, runLightTests: false, runCamera: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 700, settleDurationMs: 350,
        }, options),
        runWorkflowDiagnostics: options => runPreset({
            suite: 'workflow', includeStudio: false, includeHeavyStudio: false,
            bootstrapProject: false, runPreflight: true, autoExport: true,
            runModeCycle: false, runOverrideModeCycle: false, runNoOverridesFixture: false,
            runFeatureToggles: false, runFeatureIsolation: false, runLightTests: false,
            runAnimation: false, runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false, traceShaderCompilation: false,
            profilerMode: 'normal', telemetryIntervalMs: 1000,
            scenarioDurationMs: 3000, settleDurationMs: 650,
            workflowRenderReuseModes: [false, true, true, false],
        }, options),
        runArtKeyDiagnostics: options => runPreset({
            suite: 'workflow', includeStudio: false, includeHeavyStudio: false,
            bootstrapProject: false, runPreflight: true, autoExport: true,
            runModeCycle: false, runOverrideModeCycle: false, runNoOverridesFixture: false,
            runFeatureToggles: false, runFeatureIsolation: false, runLightTests: false,
            runAnimation: false, runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false, traceShaderCompilation: false,
            profilerMode: 'normal', telemetryIntervalMs: 1000,
            scenarioDurationMs: 3000, settleDurationMs: 650,
            workflowRenderReuseModes: [true], workflowArtKeyCacheModes: [false, true, true, false],
        }, options),
        runArtKeyBatchDiagnostics: options => runPreset({
            suite: 'workflow', includeStudio: false, includeHeavyStudio: false,
            bootstrapProject: false, runPreflight: true, autoExport: true,
            runModeCycle: false, runOverrideModeCycle: false, runNoOverridesFixture: false,
            runFeatureToggles: false, runFeatureIsolation: false, runLightTests: false,
            runAnimation: false, runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false, traceShaderCompilation: false,
            profilerMode: 'normal', telemetryIntervalMs: 1000,
            scenarioDurationMs: 3000, settleDurationMs: 650,
            workflowRenderReuseModes: [true], workflowArtKeyCacheModes: null,
            workflowArtKeyBatchModes: [false, true, true, false],
        }, options),
        runWorldWorkflowDiagnostics: options => runPreset({
            suite: 'workflow', includeStudio: false, includeHeavyStudio: false,
            bootstrapProject: false, runPreflight: true, autoExport: true,
            runModeCycle: false, runOverrideModeCycle: false, runNoOverridesFixture: false,
            runFeatureToggles: false, runFeatureIsolation: false, runLightTests: false,
            runAnimation: false, runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false, traceShaderCompilation: false,
            traceWorkflowOperations: true, workflowWorldEdits: true,
            profilerMode: 'normal', telemetryIntervalMs: 1000,
            scenarioDurationMs: 3500, settleDurationMs: 650,
            workflowRenderReuseModes: [true], workflowArtKeyCacheModes: null, workflowArtKeyBatchModes: null,
        }, options),
        recordManualWorkflow: options => runPreset({
            suite: 'manual_workflow', includeStudio: false, includeHeavyStudio: false,
            bootstrapProject: false, runPreflight: false, autoExport: true,
            runLeakAudit: false, captureScreenshots: false, freezeAdaptiveBudget: false,
            traceWorkflowOperations: true, traceShaderCompilation: true,
            profilerMode: 'normal', telemetryIntervalMs: 1500, manualWorkflowDurationMs: 90000,
        }, options),
        runMRTRoutingDiagnostics: options => runPreset({
            suite: 'mrt_light_routing', includeStudio: false, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: true, runCamera: false,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            traceWebGLErrors: true,
            warmupTimeoutMs: 120000, scenarioDurationMs: 900, settleDurationMs: 350,
        }, options),
        runAtmosphereDiagnostics: options => runPreset({
            suite: 'atmosphere_v2', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            traceWebGLErrors: true,
            warmupTimeoutMs: 120000, scenarioDurationMs: 900, settleDurationMs: 350,
        }, options),
        runBedrockStructureDiagnostics: options => runPreset({
            suite: 'bedrock_structure', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: true,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: true, autoExport: true,
            traceWebGLErrors: true, failOnWebGLError: true, failOnRuntimeError: true,
            warmupTimeoutMs: 120000, scenarioDurationMs: 1200, settleDurationMs: 500,
            profilerMode: 'deep', freezeAdaptiveBudget: true
        }, options),
        runVolumeDiagnostics: options => runPreset({
            suite: 'volume_complete', runCoreScenarios: false,
            includeStudio: true, includeHeavyStudio: false,
            runModeCycle: false, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: true, autoExport: true,
            traceWebGLErrors: true, failOnWebGLError: true, failOnRuntimeError: true,
            warmupTimeoutMs: 120000, scenarioDurationMs: 900, settleDurationMs: 350,
            profilerMode: 'deep', freezeAdaptiveBudget: true
        }, options),
        runPerformanceBaseline: options => runPreset({
            suite: 'performance_baseline',
            runModeCycle: false, runOverrideModeCycle: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runFeatureToggles: false, runFeatureIsolation: true,
            runEditTransform: false, runAnimation: false,
            runLightTests: true, runCamera: true,
            includeStudio: true, includeHeavyStudio: true,
            studioModeMatrix: false, studioHdModes: MODE_IDS.slice(),
            runStress: true, runSoak: false, runContextRecovery: false,
            stressIterations: 8, stressCubeCount: 1000,
            stressLightCount: 8, stressDurationMs: 10000,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 1800, settleDurationMs: 600
        }, options),
        // The default investigation is intentionally moderate: it covers real
        // interaction, effect isolation, a bounded scene stress, leak/soak and
        // Studio smoke without forcing context loss or a 4K render.
        runCompilationDiagnostics: options => runPreset({
            suite: 'shader_compilation', bootstrapProject: true, bootstrapFixtureCount: 2,
            bootstrapCloseReopen: true, bootstrapIncludeAnimation: false,
            runPreflight: true, runLeakAudit: true,
            scenarioDurationMs: 1000, settleDurationMs: 500, stressDurationMs: 1000,
            stressLightCount: 6, traceShaderCompilation: true,
            captureConsole: true, captureEvents: true, captureLongTasks: true,
            traceWebGLErrors: false, captureScreenshots: false,
            profilerMode: 'normal', freezeAdaptiveBudget: true, autoExport: true
        }, options),
        runPerformanceDiagnostics: options => runPreset({
            suite: 'performance_diagnostics',
            bootstrapProject: true, bootstrapFixtureCount: 2, bootstrapCloseReopen: true,
            bootstrapIncludeAnimation: true, runCoreScenarios: true, runPreflight: true,
            runModeCycle: true, modeIds: ['classic', 'lightflow', 'cinematic_craft'],
            runOverrideModeCycle: false, runInteractionPerMode: true,
            runFeatureToggles: true, runFeatureIsolation: true,
            runNoOverridesFixture: false, runEditTransform: true, runAnimation: true,
            animationRequireNativePlayback: true,
            runAnimationMatrix: true, runAnimationIsolation: true,
            animationModeIds: ['lightflow', 'cinematic_craft'], animationShadowStates: ['current', 'off', 'on'],
            animationIsolationDurationMs: 2000,
            runLightTests: true, runCamera: true,
            runVolumeMatrix: true, runProjectSwitching: false,
            includeStudio: true, includeHeavyStudio: false,
            runStudioQualityContract: true, runStudioPostBenchmark: false, studioModeMatrix: true, studioHdModes: [],
            studioSmokeResolution: [512, 512], studioSamples: 1,
            runStress: true, stressSceneOnly: false, stressIterations: 4, stressCubeCount: 192,
            stressLightCount: 6, stressDurationMs: 6000,
            runSoak: true, soakDurationMs: 20000,
            runContextRecovery: false, runLeakAudit: true,
            captureScreenshots: false, captureLongTasks: true, captureConsole: true, captureEvents: true,
            traceWebGLErrors: false, failOnWebGLError: true, failOnRuntimeError: true,
            scenarioDurationMs: 1600, animationDurationMs: 3000,
            settleDurationMs: 500, profilerMode: 'normal', freezeAdaptiveBudget: true,
            autoExport: true
        }, options),
        runSceneScalabilityDiagnostics: options => runPreset({
            suite: 'scene_scalability', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runStress: true, stressSceneOnly: true,
            stressCubeCount: 2000,
            stressCubeCheckpoints: [100, 500, 1000, 2000],
            stressSceneModes: ['classic', 'lightflow', 'cinematic_craft'],
            runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 2200, settleDurationMs: 600,
            profilerMode: 'normal', freezeAdaptiveBudget: true
        }, options),
        runSceneCullingDiagnostics: options => runPreset({
            suite: 'scene_culling', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runStress: true, stressSceneOnly: true,
            stressCubeCount: 2000,
            stressCubeCheckpoints: [1000, 2000],
            stressSceneModes: ['classic', 'lightflow', 'cinematic_craft'],
            stressBatchCellSizes: [96, 48, 32, 24],
            gpuDrainTimeoutMs: 2500,
            runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 1800, settleDurationMs: 600,
            profilerMode: 'normal', freezeAdaptiveBudget: true
        }, options),
        runSceneCpuDiagnostics: options => runPreset({
            suite: 'scene_cpu_attribution', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runStress: true, stressSceneOnly: true,
            stressCubeCount: 2000,
            stressCubeCheckpoints: [1000, 2000],
            stressSceneModes: ['classic', 'lightflow', 'cinematic_craft'],
            stressBatchCellSizes: [96],
            gpuDrainTimeoutMs: 2500,
            runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 2200, settleDurationMs: 600,
            profilerMode: 'cpu', freezeAdaptiveBudget: true
        }, options),
        runSceneTraversalDiagnostics: options => runPreset({
            suite: 'scene_traversal', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runStress: true, stressSceneOnly: true,
            stressCubeCount: 2000,
            stressCubeCheckpoints: [1000, 2000],
            stressSceneModes: ['classic', 'lightflow', 'cinematic_craft'],
            stressBatchCellSizes: [96],
            stressBatchSourceVisibilityModes: [false, true],
            gpuDrainTimeoutMs: 2500,
            runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 1800, settleDurationMs: 600,
            profilerMode: 'normal', freezeAdaptiveBudget: true
        }, options),
        runProjectSwitchingDiagnostics: options => runPreset({
            suite: 'project_switching', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runProjectSwitching: true,
            projectSwitchIterations: 2,
            projectSwitchResourceReuseModes: [false, true],
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 900, settleDurationMs: 350,
            profilerMode: 'normal', freezeAdaptiveBudget: true
        }, options),
        runAnimationDiagnostics: options => runPreset({
            suite: 'animation_max', runCoreScenarios: false,
            includeStudio: false, includeHeavyStudio: false,
            runAnimationMatrix: true,
            runAnimationIsolation: true,
            animationModeIds: ['classic', 'lightflow', 'cinematic_craft'],
            animationShadowStates: ['current', 'off', 'on'],
            animationRequireNativePlayback: true,
            animationDurationMs: 8000,
            animationIsolationDurationMs: 5000,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            scenarioDurationMs: 5000, settleDurationMs: 600,
            profilerMode: 'normal', freezeAdaptiveBudget: true
        }, options),
        runNormal: options => runPreset({
            suite: 'normal', includeStudio: true, includeHeavyStudio: false,
            studioModeMatrix: false, runModeCycle: true, runFeatureIsolation: true,
            runNoOverridesFixture: true, scenarioDurationMs: 1800,
        }, options),
        runFull: options => runPreset({ suite: 'full' }, options),
        runStress: options => runPreset({
            suite: 'stress', runCoreScenarios: false, includeStudio: false,
            runStress: true, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
        }, options),
        runEndurance: options => runPreset({
            suite: 'endurance', runCoreScenarios: false, includeStudio: false,
            runStress: false, runSoak: true, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
        }, options),
        runAdaptive: options => runPreset({
            suite: 'adaptive', runCoreScenarios: false, includeStudio: false,
            runStress: false, runSoak: true, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false,
            freezeAdaptiveBudget: false, profilerMode: 'normal', soakDurationMs: 120000
        }, options),
        runRecovery: options => runPreset({
            suite: 'recovery', runCoreScenarios: false, includeStudio: false,
            runStress: false, runSoak: false, runContextRecovery: true,
            runLeakAudit: true, captureScreenshots: false,
        }, options),
        runEverything: options => runPreset({
            suite: 'everything', runCoreScenarios: true, includeStudio: true,
            includeHeavyStudio: true, studioModeMatrix: true,
            runStress: true, runSoak: true, runContextRecovery: true,
            runLeakAudit: true,
        }, options),
        runStudio: options => runPreset({
            suite: 'studio',
            runModeCycle: false,
            runFeatureIsolation: false,
            runNoOverridesFixture: false,
            runEditTransform: false,
            runAnimation: false,
            runLightTests: false,
            runCamera: false,
            includeStudio: true
        }, options),
        runStudioPostQuality: options => runPreset({
            suite: 'studio_post_quality',
            runModeCycle: false, runOverrideModeCycle: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            includeStudio: true, includeHeavyStudio: false,
            runStudioQualityContract: true,
            studioModeMatrix: false, studioHdModes: [],
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false
        }, options),
        runStudioPostBenchmark: options => runPreset({
            suite: 'studio_post_benchmark',
            runModeCycle: false, runOverrideModeCycle: false,
            runFeatureToggles: false, runFeatureIsolation: false,
            runNoOverridesFixture: false, runInteractionPerMode: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            includeStudio: true, includeHeavyStudio: false,
            runStudioQualityContract: true, runStudioPostBenchmark: true,
            studioModeMatrix: false, studioHdModes: [], studioSamples: 1,
            studioPostBenchmarkSamples: [1, 4],
            studioPostBenchmarkWarmRepeats: 1,
            runStress: false, runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false
        }, options),
        runStudioReuseDiagnostics: options => runPreset({
            suite: 'studio_reuse', runCoreScenarios: true,
            runModeCycle: false, runOverrideModeCycle: false,
            runFeatureIsolation: false, runNoOverridesFixture: false,
            runInteractionPerMode: false, runFeatureToggles: false,
            runEditTransform: false, runAnimation: false,
            runLightTests: false, runCamera: false,
            includeStudio: true, includeHeavyStudio: true,
            studioModeMatrix: false, studioHdModes: [],
            studioRepeatHeavy: 2, runStress: false,
            runSoak: false, runContextRecovery: false,
            runLeakAudit: true, captureScreenshots: false
        }, options),
        cancel: cancelSuite,
        export: options => exportReport(lastReport, options),
        getLastReport: () => lastReport,
        getPortableReport: () => lastReport ? buildPortableReport(lastReport) : null,
        getActiveRunner: () => activeRunner,
        getProgress: () => activeRunner?.progress?.snapshot?.() || lastReport?.progress || null,
        getConfig: loadStoredConfig,
        setConfig: saveStoredConfig,
        armNextProjectLoad,
        armColdRun: options => armNextProjectLoad({ ...DEFAULT_CONFIG, suite: 'cold_full', ...(options || {}) }),
        disarmNextProjectLoad,
        isArmed: () => !!getArmedConfig(),
        snapshot: getArchitectureSnapshot,
        evaluateStudioPostQualityContract,
        buildStudioPostBenchmarkCases,
        buildStudioPostBenchmarkSummary,
        environment: buildEnvironmentSnapshot,
        summarizeFrameDeltas,
        summarizeFramePacing,
        buildPerformanceDiagnosticSummary,
        classifyPerformanceBottlenecks,
        performanceFramesToCsv,
        buildPerformanceBootstrapFixture,
        PerformanceProjectSession,
        reportToCsv,
        reportToMarkdown
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            LAB_VERSION,
            TestRunner,
            RuntimeCapture,
            ShaderCompilationCapture,
            getCompilationResponsivenessFailure,
            mapVolumeBoundsToCapture,
            FrameSampler,
            LongTaskCapture,
            nextFrame,
            DEFAULT_CONFIG,
            MODE_IDS,
            VOLUME_RENDER_CASES,
            MATERIAL_OVERRIDE_FIELDS,
            percentile,
            summarizeFrameDeltas,
            summarizeFramePacing,
            estimateScenarioCount,
            buildStudioPostBenchmarkCases,
            normalizeConfig,
            buildReportSummary,
            buildPerformanceDiagnosticSummary,
            classifyPerformanceBottlenecks,
            performanceFramesToCsv,
            buildPerformanceBootstrapFixture,
            PerformanceProjectSession,
            scenarioSummaryRow,
            reportToCsv,
            reportToMarkdown,
            buildPortableReport,
            numericDelta,
            analyzeSceneScalabilityPoint,
            evaluateStudioPostQualityContract,
            buildStudioPostBenchmarkSummary,
            compareVolumePixels
        };
        if (typeof window === 'undefined') return;
    }

    root.LightflowTestLab = api;

    let deletables = [];
    if (root.Plugin?.register) {
        root.Plugin.register('lightflow_test_lab', {
            title: 'Lightflow Test Lab',
            icon: 'speed',
            author: 'MidFord327 / OpenAI',
            description: 'Portable automated diagnostics and regression benchmarks for Lightflow renderer development.',
            version: LAB_VERSION,
            min_version: '4.9.0',
            variant: 'both',
            dependencies: ['light_manager', 'shader_architect'],
            onload() {
                root.LightflowTestLab = api;
                installProjectLoadAutomation();
                if (root.Action) {
                    const runFullAction = new root.Action('lightflow_test_lab_run_full', {
                        name: 'Lightflow Test Lab: Run Full Suite',
                        icon: 'speed',
                        click() { runSuite({ suite: 'full' }).catch(error => console.error(error)); }
                    });
                    const armAction = new root.Action('lightflow_test_lab_arm_project', {
                        name: 'Lightflow Test Lab: Arm Next Project Load',
                        icon: 'timer',
                        click() { armNextProjectLoad(); }
                    });
                    const exportAction = new root.Action('lightflow_test_lab_export', {
                        name: 'Lightflow Test Lab: Export Last Report',
                        icon: 'archive',
                        condition: () => !!lastReport,
                        click() { exportReport(lastReport).catch(error => console.error(error)); }
                    });
                    const runEverythingAction = new root.Action('lightflow_test_lab_run_everything', {
                        name: 'Lightflow Test Lab: Run Complete Matrix (includes context reset)',
                        icon: 'science',
                        click() { api.runEverything().catch(error => console.error(error)); }
                    });
                    const runPerformanceAction = new root.Action('lightflow_test_lab_run_performance_baseline', {
                        name: 'Lightflow Test Lab: Run Performance Baseline',
                        icon: 'monitoring',
                        click() { api.runPerformanceBaseline().catch(error => console.error(error)); }
                    });
                    const runAtmosphereAction = new root.Action('lightflow_test_lab_run_atmosphere_v2', {
                        name: 'Lightflow Test Lab: Run Atmosphere 2.0 Diagnostics',
                        icon: 'cloud',
                        click() { api.runAtmosphereDiagnostics().catch(error => console.error(error)); }
                    });
                    const runBedrockStructureAction = new root.Action('lightflow_test_lab_run_bedrock_structure', {
                        name: 'Lightflow Test Lab: Run Bedrock Structure Diagnostics',
                        icon: 'deployed_code',
                        click() { api.runBedrockStructureDiagnostics().catch(error => console.error(error)); }
                    });
                    const runVolumeAction = new root.Action('lightflow_test_lab_run_volume_complete', {
                        name: 'Lightflow Test Lab: Run Complete Volume Matrix',
                        icon: 'blur_on',
                        click() { api.runVolumeDiagnostics().catch(error => console.error(error)); }
                    });
                    const runStudioPostQualityAction = new root.Action('lightflow_test_lab_run_studio_post_quality', {
                        name: 'Lightflow Test Lab: Verify Studio AO/Bloom Max Quality',
                        icon: 'high_quality',
                        click() { api.runStudioPostQuality().catch(error => console.error(error)); }
                    });
                    const runStudioPostBenchmarkAction = new root.Action('lightflow_test_lab_run_studio_post_benchmark', {
                        name: 'Lightflow Test Lab: Run Complete Studio AO/Bloom Benchmark',
                        icon: 'speed',
                        click() { api.runStudioPostBenchmark().catch(error => console.error(error)); }
                    });
                    const runSceneScalabilityAction = new root.Action('lightflow_test_lab_run_scene_scalability', {
                        name: 'Lightflow Test Lab: Run Scene Scalability Matrix',
                        icon: 'grid_view',
                        click() { api.runSceneScalabilityDiagnostics().catch(error => console.error(error)); }
                    });
                    const runSceneCullingAction = new root.Action('lightflow_test_lab_run_scene_culling', {
                        name: 'Lightflow Test Lab: Run Spatial Culling Matrix',
                        icon: 'filter_center_focus',
                        click() { api.runSceneCullingDiagnostics().catch(error => console.error(error)); }
                    });
                    const runSceneCpuAction = new root.Action('lightflow_test_lab_run_scene_cpu', {
                        name: 'Lightflow Test Lab: Run Scene CPU Attribution',
                        icon: 'memory',
                        click() { api.runSceneCpuDiagnostics().catch(error => console.error(error)); }
                    });
                    const runSceneTraversalAction = new root.Action('lightflow_test_lab_run_scene_traversal', {
                        name: 'Lightflow Test Lab: Run Scene Traversal A/B',
                        icon: 'account_tree',
                        click() { api.runSceneTraversalDiagnostics().catch(error => console.error(error)); }
                    });
                    const runProjectSwitchingAction = new root.Action('lightflow_test_lab_run_project_switching', {
                        name: 'Lightflow Test Lab: Run Project Switching',
                        icon: 'tab',
                        click() { api.runProjectSwitchingDiagnostics().catch(error => console.error(error)); }
                    });
                    const runAnimationAction = new root.Action('lightflow_test_lab_run_animation', {
                        name: 'Lightflow Test Lab: Run Maximum Animation Matrix',
                        icon: 'movie',
                        click() { api.runAnimationDiagnostics().catch(error => console.error(error)); }
                    });
                    deletables.push(runFullAction, runEverythingAction, runPerformanceAction, runAtmosphereAction, runBedrockStructureAction, runVolumeAction, runStudioPostQualityAction, runStudioPostBenchmarkAction, runSceneScalabilityAction, runSceneCullingAction, runSceneCpuAction, runSceneTraversalAction, runProjectSwitchingAction, runAnimationAction, armAction, exportAction);
                    safe(() => root.MenuBar?.addAction?.(runFullAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runEverythingAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runPerformanceAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runAtmosphereAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runBedrockStructureAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runVolumeAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runStudioPostQualityAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runStudioPostBenchmarkAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runSceneScalabilityAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runSceneCullingAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runSceneCpuAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runSceneTraversalAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runProjectSwitchingAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(runAnimationAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(armAction, 'tools'), null);
                    safe(() => root.MenuBar?.addAction?.(exportAction, 'tools'), null);
                }
                console.info('[Lightflow Test Lab] Ready. Suites: runSmoke(), runShaderDiagnostics(), runRendercraftDiagnostics(), runAtmosphereDiagnostics(), runBedrockStructureDiagnostics(), runVolumeDiagnostics(), runStudioPostQuality(), runStudioPostBenchmark(), runPerformanceBaseline(), runSceneScalabilityDiagnostics(), runSceneCullingDiagnostics(), runSceneCpuDiagnostics(), runSceneTraversalDiagnostics(), runProjectSwitchingDiagnostics(), runAnimationDiagnostics(), runNormal(), runFull(), runStress(), runEndurance(), runAdaptive(), runRecovery(), runEverything(), armColdRun().');
            },
            onunload() {
                cancelSuite();
                removeProjectLoadAutomation();
                deletables.forEach(item => safe(() => item?.delete?.(), null));
                deletables = [];
                if (root.LightflowTestLab === api) delete root.LightflowTestLab;
            }
        });
    } else {
        installProjectLoadAutomation();
    }

})(typeof window !== 'undefined' ? window : globalThis);
