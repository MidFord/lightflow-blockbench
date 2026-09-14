/**
 * Lightflow UI Diagnostics
 * Runtime layout, typography, contrast, clipping, density and whitespace inspector
 * for Blockbench Panels, Dialogs and Forms.
 *
 * Designed for the Lightflow 3.x UI stack, but intentionally works on generic
 * Blockbench interfaces as well.
 */
(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_ui_diagnostics';
    const PLUGIN_VERSION = '1.1.0';
    const OVERLAY_ID = 'lightflow_ui_diagnostics_overlay';
    const PANEL_ID = 'lightflow_ui_diagnostics';
    const LIGHTFLOW_PANEL_IDS = new Set([
        'lightflow_scene',
        'light_properties',
        'lightflow_environment_panel',
        'lightflow_atmosphere_properties',
        'lightflow_scene_composer_panel',
        'global_renderer_properties',
        'material_properties',
        'visual_shader_graph_library',
        'visual_shader_graph_canvas',
        'visual_shader_graph_inspector',
        'bedrock_structure_studio'
    ]);
    const LIGHTFLOW_ID_HINTS = [
        'lightflow_', 'light_', 'shader_', 'material_', 'studio_',
        'rendercraft', 'visual_shader_', 'bedrock_structure_'
    ];

    const resources = [];
    let diagnosticsPanel = null;
    let openAction = null;
    let runtimeApi = null;
    let currentOverlay = null;
    let currentReport = null;
    let selectedTargetId = 'auto';

    const state = {
        targets: [],
        report: null,
        busy: false,
        overlayVisible: false,
        severityFilter: 'all',
        issueTypeFilter: 'all',
        lastError: ''
    };

    const severityRank = { error: 3, warning: 2, info: 1 };
    const issueLabels = {
        clipping: 'Clipping',
        overflow: 'Overflow',
        overlap: 'Overlap',
        text_clip: 'Text clipping',
        text_density: 'Text density',
        typography: 'Typography',
        contrast: 'Contrast',
        target_size: 'Target size',
        alignment: 'Alignment',
        spacing: 'Spacing',
        whitespace: 'Unused space',
        scrollbar: 'Scrollbar',
        density: 'Visual density',
        hierarchy: 'Hierarchy',
        accessibility: 'Accessibility',
        geometry: 'Geometry',
        configuration: 'Form configuration'
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits = 1) {
        const factor = Math.pow(10, digits);
        return Math.round((Number(value) || 0) * factor) / factor;
    }

    function isFiniteNumber(value) {
        return Number.isFinite(Number(value));
    }

    function cssEscape(value) {
        if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
    }

    function isVisible(element) {
        if (!(element instanceof Element) || !element.isConnected) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.001) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0.5 && rect.height > 0.5;
    }

    function rectOf(element) {
        const r = element.getBoundingClientRect();
        return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            x: r.x,
            y: r.y,
            area: Math.max(0, r.width) * Math.max(0, r.height)
        };
    }

    function relativeRect(rect, rootRect) {
        return {
            x: round(rect.left - rootRect.left),
            y: round(rect.top - rootRect.top),
            width: round(rect.width),
            height: round(rect.height),
            right: round(rect.right - rootRect.left),
            bottom: round(rect.bottom - rootRect.top)
        };
    }

    function intersection(a, b) {
        const left = Math.max(a.left, b.left);
        const top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        if (right <= left || bottom <= top) return null;
        return {
            left, top, right, bottom,
            width: right - left,
            height: bottom - top,
            area: (right - left) * (bottom - top)
        };
    }

    function containsRect(outer, inner, tolerance = 0.5) {
        return inner.left >= outer.left - tolerance &&
            inner.top >= outer.top - tolerance &&
            inner.right <= outer.right + tolerance &&
            inner.bottom <= outer.bottom + tolerance;
    }

    function elementText(element) {
        if (!(element instanceof Element)) return '';
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            return String(element.value || element.placeholder || '').trim();
        }
        return String(element.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isTextBearing(element) {
        if (!(element instanceof Element)) return false;
        const tag = element.tagName;
        if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CANVAS'].includes(tag)) return false;
        const text = elementText(element);
        if (!text) return false;
        if (element.children.length === 0) return true;
        if (['BUTTON', 'LABEL', 'OPTION', 'A', 'P', 'SPAN', 'H1', 'H2', 'H3', 'H4'].includes(tag)) return true;
        return false;
    }

    function isInteractive(element) {
        if (!(element instanceof Element)) return false;
        if (element.matches('button, input, select, textarea, a[href], [role="button"], [tabindex]:not([tabindex="-1"]), .tool, .widget, .custom_checkbox, .compact_dropdown_select, .horizontal_select_btn, .light_manager_action_button')) return true;
        return false;
    }

    function isPrimaryInteractive(element) {
        if (!isInteractive(element)) return false;
        if (element.matches('button, input, select, textarea, a[href], [role="button"]')) return true;
        return !Array.from(element.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')).some(isVisible);
    }

    function semanticType(element) {
        if (!(element instanceof Element)) return 'element';
        const bar = element.closest('.form_bar');
        if (bar === element) return 'form_bar';
        if (element.matches('label')) return 'label';
        if (element.matches('button, [role="button"]')) return 'button';
        if (element.matches('input[type="range"], .combo_slider')) return 'slider';
        if (element.matches('select, .compact_dropdown_select, .enum_select, .horizontal_select')) return 'select';
        if (element.matches('input, textarea')) return 'input';
        if (element.matches('.bar_display, h1, h2, h3, h4')) return 'heading';
        if (element.matches('.panel_search, .light_manager_panel_search')) return 'search';
        if (element.matches('.dialog_content')) return 'dialog_content';
        if (element.matches('.panel, .panel_vue_wrapper')) return 'panel_content';
        return isInteractive(element) ? 'control' : (isTextBearing(element) ? 'text' : 'element');
    }

    function formKeyFor(element) {
        const bar = element.closest?.('.form_bar');
        if (!bar) return '';
        const match = Array.from(bar.classList).map(name => name.match(/^form_bar_(.+)$/)).find(Boolean);
        return match ? match[1] : '';
    }

    function formTypeFor(element) {
        const bar = element.closest?.('.form_bar');
        return bar?.getAttribute('form_type') || '';
    }

    function conciseSelector(element, root) {
        if (!(element instanceof Element)) return '';
        if (element.id) return `#${element.id}`;
        const parts = [];
        let current = element;
        for (let depth = 0; current && current !== root && depth < 4; depth++, current = current.parentElement) {
            let part = current.tagName.toLowerCase();
            const usefulClasses = Array.from(current.classList || []).filter(name =>
                /^form_bar_|^light_manager_|^lightflow_|^compact_|^custom_|^panel_|^dialog_|^bar_display|^horizontal_/.test(name)
            ).slice(0, 2);
            if (usefulClasses.length) part += '.' + usefulClasses.map(cssEscape).join('.');
            if (!usefulClasses.length && current.parentElement) {
                const sameTags = Array.from(current.parentElement.children).filter(child => child.tagName === current.tagName);
                if (sameTags.length > 1) part += `:nth-of-type(${sameTags.indexOf(current) + 1})`;
            }
            parts.unshift(part);
        }
        return parts.join(' > ') || element.tagName.toLowerCase();
    }

    function sourceHintFor(element, target) {
        const key = formKeyFor(element);
        const type = formTypeFor(element);
        const pieces = [];
        if (target?.kind === 'panel') pieces.push(`Panel '${target.panelId || target.id}'`);
        if (target?.kind === 'dialog') pieces.push(`Dialog '${target.dialogId || target.id}'`);
        if (key) pieces.push(`form key '${key}'`);
        if (type) pieces.push(`type '${type}'`);
        return pieces.join(' · ');
    }

    function closestOverflowAncestor(element, root) {
        let current = element.parentElement;
        while (current && current !== root.parentElement) {
            const style = getComputedStyle(current);
            const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX);
            const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY);
            if (clipsX || clipsY) return { element: current, style, clipsX, clipsY };
            if (current === root) break;
            current = current.parentElement;
        }
        return null;
    }

    function parseColor(input) {
        if (!input || input === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        const rgba = String(input).match(/rgba?\(([^)]+)\)/i);
        if (rgba) {
            const parts = rgba[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
            return {
                r: clamp(parts[0] || 0, 0, 255),
                g: clamp(parts[1] || 0, 0, 255),
                b: clamp(parts[2] || 0, 0, 255),
                a: parts.length > 3 ? clamp(parts[3], 0, 1) : 1
            };
        }
        const hex = String(input).trim().match(/^#([0-9a-f]{3,8})$/i);
        if (hex) {
            let value = hex[1];
            if (value.length === 3 || value.length === 4) value = value.split('').map(ch => ch + ch).join('');
            const hasAlpha = value.length === 8;
            return {
                r: parseInt(value.slice(0, 2), 16),
                g: parseInt(value.slice(2, 4), 16),
                b: parseInt(value.slice(4, 6), 16),
                a: hasAlpha ? parseInt(value.slice(6, 8), 16) / 255 : 1
            };
        }
        return { r: 0, g: 0, b: 0, a: 1 };
    }

    function composite(fg, bg) {
        const a = fg.a + bg.a * (1 - fg.a);
        if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
            r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
            g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
            b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
            a
        };
    }

    function effectiveBackground(element, root) {
        let color = { r: 0, g: 0, b: 0, a: 0 };
        let current = element;
        const layers = [];
        while (current && current !== root.parentElement) {
            const bg = parseColor(getComputedStyle(current).backgroundColor);
            if (bg.a > 0) layers.push(bg);
            if (current === root) break;
            current = current.parentElement;
        }
        layers.reverse().forEach(layer => { color = composite(layer, color); });
        if (color.a < 0.99) color = composite(color, { r: 32, g: 32, b: 32, a: 1 });
        return color;
    }

    function luminance(color) {
        const channel = value => {
            const s = value / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function contrastRatio(a, b) {
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function effectiveTextColor(element) {
        const style = getComputedStyle(element);
        const fg = parseColor(style.color);
        if (fg.a >= 0.999) return fg;
        return composite(fg, { r: 0, g: 0, b: 0, a: 1 });
    }

    function addIssue(report, data) {
        const element = data.element || report.target.element;
        const rect = data.rect || (element?.getBoundingClientRect ? rectOf(element) : report.targetRect);
        const severity = data.severity || 'warning';
        const issue = {
            id: `I${String(report.issues.length + 1).padStart(3, '0')}`,
            severity,
            type: data.type || 'geometry',
            title: data.title || issueLabels[data.type] || 'UI issue',
            message: data.message || '',
            why: data.why || '',
            fix: data.fix || '',
            selector: data.selector || conciseSelector(element, report.target.element),
            sourceHint: data.sourceHint || sourceHintFor(element, report.target),
            formKey: formKeyFor(element),
            formType: formTypeFor(element),
            rect: relativeRect(rect, report.targetRect),
            metrics: data.metrics || {},
            element
        };
        report.issues.push(issue);
        report.summary[severity] = (report.summary[severity] || 0) + 1;
        report.summary.total++;
        return issue;
    }

    function getPanelRegistry() {
        return window.Interface?.Panels || window.Panels || {};
    }

    function isLightflowId(id) {
        const value = String(id || '').toLowerCase();
        return LIGHTFLOW_PANEL_IDS.has(value) || LIGHTFLOW_ID_HINTS.some(prefix => value.includes(prefix));
    }

    function discoverTargets() {
        const targets = [];
        const seen = new Set();

        const openDialog = window.Dialog?.open;
        if (openDialog?.object instanceof HTMLElement && openDialog.id !== PANEL_ID && isVisible(openDialog.object)) {
            const id = `dialog:${openDialog.id || openDialog.object.id || 'open'}`;
            targets.push({
                id,
                name: `Dialog · ${openDialog.title || openDialog.id || 'Open dialog'}`,
                kind: 'dialog',
                dialogId: openDialog.id || '',
                object: openDialog,
                element: openDialog.object,
                lightflow: isLightflowId(openDialog.id)
            });
            seen.add(openDialog.object);
        }

        document.querySelectorAll('.dialog').forEach((element, index) => {
            if (!isVisible(element) || seen.has(element) || element.closest(`#panel_${PANEL_ID}`)) return;
            const dialogId = element.id || `dom_${index}`;
            targets.push({
                id: `dialog:${dialogId}`,
                name: `Dialog · ${dialogId}`,
                kind: 'dialog',
                dialogId,
                object: null,
                element,
                lightflow: isLightflowId(dialogId)
            });
            seen.add(element);
        });

        const panels = getPanelRegistry();
        Object.keys(panels).forEach(panelId => {
            const panel = panels[panelId];
            const element = panel?.node || document.getElementById(`panel_${panelId}`);
            if (!(element instanceof HTMLElement) || !isVisible(element)) return;
            targets.push({
                id: `panel:${panelId}`,
                name: `${isLightflowId(panelId) ? 'Lightflow ' : ''}Panel · ${panel.name || panelId}`,
                kind: 'panel',
                panelId,
                object: panel,
                element,
                lightflow: isLightflowId(panelId)
            });
        });

        state.targets = targets.sort((a, b) => Number(b.lightflow) - Number(a.lightflow) || a.name.localeCompare(b.name));
        return state.targets;
    }

    function getTargetById(id) {
        const targets = discoverTargets();
        if (!id || id === 'auto') {
            const dialog = targets.find(target => target.kind === 'dialog' && target.lightflow);
            if (dialog) return dialog;
            const lfPanel = targets.find(target => target.kind === 'panel' && target.lightflow);
            if (lfPanel) return lfPanel;
            return targets[0] || null;
        }
        return targets.find(target => target.id === id) || null;
    }

    function collectElements(root) {
        const result = [];
        if (isVisible(root)) result.push(root);
        root.querySelectorAll('*').forEach(element => {
            if (!isVisible(element)) return;
            if (element.closest(`#${OVERLAY_ID}`) || element.closest(`#panel_${PANEL_ID}`)) return;
            result.push(element);
        });
        return result;
    }

    function analyzeRootGeometry(report) {
        const root = report.target.element;
        const rect = report.targetRect;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        if (rect.left < -1 || rect.top < -1 || rect.right > viewportWidth + 1 || rect.bottom > viewportHeight + 1) {
            addIssue(report, {
                type: 'geometry',
                severity: 'error',
                element: root,
                title: 'Target extends outside the window',
                message: `The UI target is not fully inside the Blockbench viewport (${round(viewportWidth)}×${round(viewportHeight)} px).`,
                why: 'Controls near the clipped edge can become unreachable even when their own geometry is valid.',
                fix: 'Reduce fixed dimensions, allow the main content area to scroll, or use responsive width/height constraints.',
                metrics: { viewportWidth, viewportHeight, target: relativeRect(rect, { left: 0, top: 0 }) }
            });
        }

        const horizontalOverflow = root.scrollWidth - root.clientWidth;
        const verticalOverflow = root.scrollHeight - root.clientHeight;
        if (horizontalOverflow > 1) {
            addIssue(report, {
                type: 'overflow', severity: 'error', element: root,
                title: 'Horizontal overflow in target',
                message: `Content is ${round(horizontalOverflow)} px wider than the available area.`,
                why: 'Horizontal overflow in a sidebar/dialog usually produces clipping or an undesirable horizontal scrollbar.',
                fix: 'Find the widest child, add min-width:0 to flex children, permit wrapping, or replace fixed widths with flex/percentage sizing.',
                metrics: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, overflow: horizontalOverflow }
            });
        }
        if (verticalOverflow > 1) {
            const style = getComputedStyle(root);
            const scrollable = /(auto|scroll)/.test(style.overflowY);
            addIssue(report, {
                type: 'overflow', severity: scrollable ? 'info' : 'error', element: root,
                title: scrollable ? 'Scrollable vertical content' : 'Hidden vertical overflow',
                message: `Content is ${round(verticalOverflow)} px taller than the visible target.`,
                why: scrollable ? 'This can be valid, but dense nested scrolling often hurts panel usability.' : `The target uses overflow-y:${style.overflowY}, so lower controls may be clipped.`,
                fix: scrollable ? 'Keep one clear scrolling surface and avoid nested scroll containers.' : 'Use overflow-y:auto on the intended content surface or remove the fixed height.',
                metrics: { clientHeight: root.clientHeight, scrollHeight: root.scrollHeight, overflow: verticalOverflow, overflowY: style.overflowY }
            });
        }
    }

    function analyzeClippingAndOverflow(report, elements) {
        const root = report.target.element;
        for (const element of elements) {
            if (element === root) continue;
            const rect = rectOf(element);
            const style = getComputedStyle(element);

            const ownXOverflow = element.scrollWidth - element.clientWidth;
            const ownYOverflow = element.scrollHeight - element.clientHeight;
            if (ownXOverflow > 2 && !['visible', 'clip'].includes(style.overflowX)) {
                const textLike = isTextBearing(element);
                addIssue(report, {
                    type: textLike ? 'text_clip' : 'overflow',
                    severity: textLike ? 'warning' : 'info',
                    element,
                    title: textLike ? 'Text exceeds its box' : 'Nested horizontal overflow',
                    message: `${textLike ? 'Text/content' : 'Content'} is ${round(ownXOverflow)} px wider than this element.`,
                    why: `Computed overflow-x is '${style.overflowX}'.`,
                    fix: textLike ? 'Allow wrapping, increase the available control width, shorten the label, or use intentional ellipsis with a tooltip.' : 'Check fixed child widths and flex min-width constraints.',
                    metrics: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX }
                });
            }
            if (ownYOverflow > 2 && !['visible', 'clip'].includes(style.overflowY) && isTextBearing(element)) {
                addIssue(report, {
                    type: 'text_clip', severity: 'warning', element,
                    title: 'Text exceeds its height',
                    message: `Text needs about ${round(ownYOverflow)} px more vertical room.`,
                    why: `Computed overflow-y is '${style.overflowY}' and the text box is shorter than its scroll height.`,
                    fix: 'Remove fixed line heights/heights, allow wrapping, or increase the minimum height of this form row.',
                    metrics: { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: style.overflowY }
                });
            }

            let ancestor = element.parentElement;
            while (ancestor && ancestor !== root.parentElement) {
                if (!isVisible(ancestor)) break;
                const ancestorStyle = getComputedStyle(ancestor);
                // auto/scroll intentionally clips the current viewport while keeping the
                // content reachable. Hidden/clip is the dangerous case: content can be lost.
                const clipsX = /(hidden|clip)/.test(ancestorStyle.overflowX);
                const clipsY = /(hidden|clip)/.test(ancestorStyle.overflowY);
                if (clipsX || clipsY) {
                    const aRect = rectOf(ancestor);
                    const xClipped = clipsX && (rect.left < aRect.left - 1 || rect.right > aRect.right + 1);
                    const yClipped = clipsY && (rect.top < aRect.top - 1 || rect.bottom > aRect.bottom + 1);
                    if (xClipped || yClipped) {
                        addIssue(report, {
                            type: 'clipping', severity: 'error', element,
                            title: 'Element clipped by ancestor',
                            message: `This ${semanticType(element)} extends beyond ${conciseSelector(ancestor, root)} on ${[xClipped ? 'X' : '', yClipped ? 'Y' : ''].filter(Boolean).join(' + ')}.`,
                            why: `The ancestor has overflow ${ancestorStyle.overflowX}/${ancestorStyle.overflowY}.`,
                            fix: 'Remove the fixed child size, add min-width:0/min-height:0 to the correct flex child, allow wrapping, or move scrolling to the intended content container.',
                            metrics: { ancestor: conciseSelector(ancestor, root), overflowX: ancestorStyle.overflowX, overflowY: ancestorStyle.overflowY }
                        });
                        break;
                    }
                }
                if (ancestor === root) break;
                ancestor = ancestor.parentElement;
            }
        }
    }

    function collisionCandidates(elements, root) {
        return elements.filter(element => {
            if (element === root) return false;
            const type = semanticType(element);
            if (['label', 'button', 'slider', 'select', 'input', 'control', 'heading', 'search'].includes(type)) return true;
            if (element.matches('.form_bar, .light_manager_action_button, .custom_checkbox, .compact_dropdown_select')) return true;
            return false;
        });
    }

    function nearestSemanticContainer(element) {
        return element.closest('.form_bar, .form_row_group, .light_manager_gradient_editor, .dialog_bar, .panel_tab_bar') || element.parentElement;
    }

    function expectedInternalOverlap(a, b) {
        if (a.contains(b) || b.contains(a)) return true;
        const ca = nearestSemanticContainer(a);
        const cb = nearestSemanticContainer(b);
        if (ca && ca === cb) {
            if (a.matches('label') || b.matches('label')) return false;
            return true;
        }
        if (a.closest('button') === b.closest('button') && a.closest('button')) return true;
        if (a.closest('.custom_checkbox') === b.closest('.custom_checkbox') && a.closest('.custom_checkbox')) return true;
        return false;
    }

    function analyzeCollisions(report, elements) {
        const root = report.target.element;
        const candidates = collisionCandidates(elements, root).map(element => ({ element, rect: rectOf(element) }));
        const cellSize = 96;
        const buckets = new Map();
        const checked = new Set();

        candidates.forEach((item, index) => {
            const minX = Math.floor(item.rect.left / cellSize);
            const maxX = Math.floor(item.rect.right / cellSize);
            const minY = Math.floor(item.rect.top / cellSize);
            const maxY = Math.floor(item.rect.bottom / cellSize);
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const key = `${x}:${y}`;
                    if (!buckets.has(key)) buckets.set(key, []);
                    buckets.get(key).push(index);
                }
            }
        });

        buckets.forEach(indices => {
            for (let i = 0; i < indices.length; i++) {
                for (let j = i + 1; j < indices.length; j++) {
                    const ia = indices[i], ib = indices[j];
                    const pairKey = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
                    if (checked.has(pairKey)) continue;
                    checked.add(pairKey);
                    const a = candidates[ia], b = candidates[ib];
                    if (expectedInternalOverlap(a.element, b.element)) continue;
                    const overlap = intersection(a.rect, b.rect);
                    if (!overlap || overlap.width < 3 || overlap.height < 3 || overlap.area < 24) continue;
                    const minArea = Math.max(1, Math.min(a.rect.area, b.rect.area));
                    const ratio = overlap.area / minArea;
                    if (ratio < 0.08 && overlap.area < 80) continue;

                    addIssue(report, {
                        type: 'overlap', severity: ratio > 0.35 ? 'error' : 'warning', element: a.element,
                        rect: overlap,
                        title: 'Two UI elements overlap',
                        message: `${semanticType(a.element)} '${elementText(a.element).slice(0, 38)}' overlaps ${semanticType(b.element)} '${elementText(b.element).slice(0, 38)}'.`,
                        why: `Their visible rectangles overlap by ${round(overlap.area)} px² (${round(ratio * 100)}% of the smaller element).`,
                        fix: 'Check flex basis, absolute positioning, negative margins, fixed widths, or whether the row should wrap.',
                        metrics: { overlapArea: round(overlap.area), overlapRatio: round(ratio, 3), other: conciseSelector(b.element, root) }
                    });
                }
            }
        });
    }

    function analyzeTypography(report, elements) {
        const root = report.target.element;
        const textElements = elements.filter(isTextBearing);
        const fontSizes = [];
        const fontWeights = [];
        for (const element of textElements) {
            const style = getComputedStyle(element);
            const text = elementText(element);
            const rect = rectOf(element);
            const fontSize = parseFloat(style.fontSize) || 0;
            const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight) || fontSize * 1.2;
            fontSizes.push(round(fontSize));
            fontWeights.push(String(style.fontWeight));

            if (fontSize > 0 && fontSize < 10.5 && text.length > 1) {
                addIssue(report, {
                    type: 'typography', severity: 'warning', element,
                    title: 'Very small text',
                    message: `Text renders at ${round(fontSize)} px.`,
                    why: 'Small labels become hard to scan in dense Blockbench panels, especially on scaled displays.',
                    fix: 'Prefer the Blockbench inherited font size or keep secondary labels around 11–12 px unless space is extremely constrained.',
                    metrics: { fontSize }
                });
            }
            if (lineHeight < fontSize * 1.05 && text.length > 10) {
                addIssue(report, {
                    type: 'text_density', severity: 'warning', element,
                    title: 'Compressed line height',
                    message: `Line height (${round(lineHeight)} px) is almost the same as font size (${round(fontSize)} px).`,
                    why: 'Multi-line or wrapped copy can visually collide with itself.',
                    fix: 'Use line-height around 1.2–1.4 for descriptive text.',
                    metrics: { fontSize, lineHeight, ratio: round(lineHeight / Math.max(fontSize, 1), 2) }
                });
            }
            if (text.length >= 18 && rect.width < fontSize * Math.min(text.length, 24) * 0.35 && style.whiteSpace === 'nowrap') {
                addIssue(report, {
                    type: 'text_density', severity: 'warning', element,
                    title: 'Long text in a narrow box',
                    message: `A ${text.length}-character string is constrained to ${round(rect.width)} px with nowrap.`,
                    why: 'This is a common source of ellipsis, clipped labels, and controls pushed out of form rows.',
                    fix: 'Shorten the label, allow wrapping for descriptive copy, or reserve more width for the label column.',
                    metrics: { characters: text.length, width: round(rect.width), whiteSpace: style.whiteSpace }
                });
            }
            if (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 2) {
                addIssue(report, {
                    type: 'text_clip', severity: element.matches('.panel_handle span') ? 'info' : 'warning', element,
                    title: 'Text is being ellipsized',
                    message: `'${text.slice(0, 70)}${text.length > 70 ? '…' : ''}' does not fit its current width.`,
                    why: 'Ellipsis is intentional only when the full value is available by tooltip/context and the label is not essential for understanding.',
                    fix: 'Increase width, reduce copy, or add a tooltip if truncation is intentional.',
                    metrics: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }
                });
            }
        }

        const uniqueSizes = Array.from(new Set(fontSizes.filter(Boolean)));
        if (uniqueSizes.length > 6 && textElements.length >= 12) {
            addIssue(report, {
                type: 'hierarchy', severity: 'info', element: root,
                title: 'Many font sizes in one surface',
                message: `${uniqueSizes.length} different computed font sizes are visible.`,
                why: 'Too many typographic scales can make a settings panel feel visually noisy instead of hierarchical.',
                fix: 'Consolidate onto a small scale: primary, normal, secondary/caption, with weight/color carrying the rest of the hierarchy.',
                metrics: { fontSizes: uniqueSizes.sort((a, b) => a - b) }
            });
        }
        report.metrics.typography = {
            textElements: textElements.length,
            fontSizes: uniqueSizes.sort((a, b) => a - b),
            fontWeights: Array.from(new Set(fontWeights))
        };
    }

    function analyzeContrast(report, elements) {
        const root = report.target.element;
        let checked = 0;
        let failures = 0;
        for (const element of elements) {
            if (!isTextBearing(element)) continue;
            const style = getComputedStyle(element);
            if (Number(style.opacity) < 0.55) continue;
            const fontSize = parseFloat(style.fontSize) || 12;
            const weight = parseInt(style.fontWeight, 10) || 400;
            const foreground = effectiveTextColor(element);
            const background = effectiveBackground(element, root);
            const ratio = contrastRatio(foreground, background);
            const large = fontSize >= 18 || (fontSize >= 14 && weight >= 700);
            const threshold = large ? 3 : 4.5;
            checked++;
            if (ratio < threshold) {
                failures++;
                addIssue(report, {
                    type: 'contrast', severity: ratio < 2.5 ? 'error' : 'warning', element,
                    title: 'Low text contrast',
                    message: `Estimated contrast is ${round(ratio, 2)}:1; this text needs about ${threshold}:1 for comfortable readability.`,
                    why: 'The computed foreground and nearest opaque background are too similar.',
                    fix: 'Use Blockbench text/subtle-text tokens only where they remain readable on the actual background; avoid lowering opacity further.',
                    metrics: { ratio: round(ratio, 2), threshold, color: style.color, background: getComputedStyle(element).backgroundColor }
                });
            }
        }
        report.metrics.contrast = { checked, failures };
    }

    function analyzeTargetSizesAndCentering(report, elements) {
        const root = report.target.element;
        const controls = elements.filter(isPrimaryInteractive);
        let tiny = 0;
        for (const element of controls) {
            const rect = rectOf(element);
            const style = getComputedStyle(element);
            const effectiveWidth = rect.width;
            const effectiveHeight = rect.height;
            const iconOnly = !elementText(element) || elementText(element).length <= 2 || element.matches('.tool, .panel_control');
            if ((effectiveWidth < 22 || effectiveHeight < 22) && !element.matches('input[type="range"]')) {
                tiny++;
                addIssue(report, {
                    type: 'target_size', severity: effectiveWidth < 16 || effectiveHeight < 16 ? 'error' : 'warning', element,
                    title: 'Small interactive target',
                    message: `Interactive area is ${round(effectiveWidth)}×${round(effectiveHeight)} px.`,
                    why: 'Very small controls are harder to hit and make dense panels feel cramped.',
                    fix: 'Increase min-width/min-height or padding; icon-only controls should normally have a comfortable square hit area.',
                    metrics: { width: round(effectiveWidth), height: round(effectiveHeight), iconOnly }
                });
            }

            const icon = element.querySelector(':scope > i.material-icons, :scope > i.fa, :scope > svg');
            if (icon && isVisible(icon) && iconOnly) {
                const iconRect = rectOf(icon);
                const dx = Math.abs((iconRect.left + iconRect.width / 2) - (rect.left + rect.width / 2));
                const dy = Math.abs((iconRect.top + iconRect.height / 2) - (rect.top + rect.height / 2));
                if (dx > 3.5 || dy > 3.5) {
                    addIssue(report, {
                        type: 'alignment', severity: 'info', element,
                        title: 'Icon is not visually centered',
                        message: `Icon center is offset by ${round(dx)} px horizontally and ${round(dy)} px vertically.`,
                        why: `Padding/line-height (${style.padding}, ${style.lineHeight}) shifts the glyph inside its hit area.`,
                        fix: 'Use inline-flex with align-items:center; justify-content:center and avoid compensating padding unless the glyph itself is optically asymmetric.',
                        metrics: { dx: round(dx), dy: round(dy) }
                    });
                }
            }
        }
        report.metrics.controls = { count: controls.length, tinyTargets: tiny };
    }

    function analyzeFormAlignment(report) {
        const root = report.target.element;
        const bars = Array.from(root.querySelectorAll('.form_bar')).filter(isVisible);
        const rows = [];
        bars.forEach(bar => {
            const label = bar.querySelector(':scope > label.name_space_left, :scope > label');
            const control = Array.from(bar.children).find(child => child !== label && isVisible(child) && !child.classList.contains('dialog_form_description'));
            if (!label || !control) return;
            const l = rectOf(label);
            const c = rectOf(control);
            rows.push({ bar, label, control, labelRect: l, controlRect: c });
        });

        if (rows.length >= 4) {
            const controlLefts = rows.map(row => row.controlRect.left).sort((a, b) => a - b);
            const median = controlLefts[Math.floor(controlLefts.length / 2)];
            rows.forEach(row => {
                const delta = Math.abs(row.controlRect.left - median);
                if (delta > 10 && !row.bar.classList.contains('full_width_dialog_bar') && !row.bar.closest('.form_row_group')) {
                    addIssue(report, {
                        type: 'alignment', severity: 'warning', element: row.control,
                        title: 'Control column is misaligned',
                        message: `This control starts ${round(delta)} px away from the median control column.`,
                        why: 'Native Blockbench forms normally share one max label width; custom row styling or full-width behavior has broken that rhythm.',
                        fix: 'Keep the native label column, or make the entire group intentionally full-width instead of shifting a single row.',
                        metrics: { controlLeft: round(row.controlRect.left - report.targetRect.left), medianLeft: round(median - report.targetRect.left), delta: round(delta) }
                    });
                }
            });
        }

        const parentGroups = new Map();
        bars.forEach(bar => {
            const parent = bar.parentElement;
            if (!parentGroups.has(parent)) parentGroups.set(parent, []);
            parentGroups.get(parent).push(bar);
        });
        parentGroups.forEach(group => {
            if (group.length < 4) return;
            const sorted = group.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            const gaps = [];
            for (let i = 1; i < sorted.length; i++) {
                const prev = rectOf(sorted[i - 1]);
                const next = rectOf(sorted[i]);
                const gap = next.top - prev.bottom;
                if (gap >= 0 && gap < 40) gaps.push(gap);
            }
            if (gaps.length < 3) return;
            const ordered = gaps.slice().sort((a, b) => a - b);
            const medianGap = ordered[Math.floor(ordered.length / 2)];
            gaps.forEach((gap, index) => {
                if (gap > medianGap + 10 && gap > medianGap * 2 + 3) {
                    addIssue(report, {
                        type: 'spacing', severity: 'info', element: sorted[index + 1],
                        title: 'Inconsistent vertical gap',
                        message: `Gap before this row is ${round(gap)} px; the local median is ${round(medianGap)} px.`,
                        why: 'Unexpected margins, separators, or hidden-group styling can create visual holes that look accidental.',
                        fix: 'Use a deliberate subsection/header spacing token, or normalize margins between peer form rows.',
                        metrics: { gap: round(gap), medianGap: round(medianGap) }
                    });
                }
            });
        });

        report.metrics.form = { visibleBars: bars.length, alignedRows: rows.length };
    }

    function analyzeScrollbars(report, elements) {
        const root = report.target.element;
        let nested = 0;
        for (const element of elements) {
            const style = getComputedStyle(element);
            const sx = element.scrollWidth > element.clientWidth + 1;
            const sy = element.scrollHeight > element.clientHeight + 1;
            const scrollX = sx && /(auto|scroll)/.test(style.overflowX);
            const scrollY = sy && /(auto|scroll)/.test(style.overflowY);
            if (!scrollX && !scrollY) continue;
            nested++;
            if (scrollX) {
                addIssue(report, {
                    type: 'scrollbar', severity: 'warning', element,
                    title: 'Horizontal scrollbar required',
                    message: `This surface needs horizontal scrolling (${element.clientWidth} → ${element.scrollWidth} px).`,
                    why: 'Settings panels should almost never require horizontal scrolling.',
                    fix: 'Remove the fixed-width offender, let flex children shrink with min-width:0, or wrap the row.',
                    metrics: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }
                });
            }
        }
        if (nested > 2) {
            addIssue(report, {
                type: 'scrollbar', severity: 'info', element: root,
                title: 'Multiple nested scroll surfaces',
                message: `${nested} visible descendants currently have scrollable overflow.`,
                why: 'Nested scrolling makes wheel/trackpad behavior less predictable and can hide content boundaries.',
                fix: 'Prefer one main scrolling content surface per panel/dialog, keeping subsections intrinsically sized.',
                metrics: { scrollSurfaces: nested }
            });
        }
        report.metrics.scrollSurfaces = nested;
    }

    function occupancyGrid(root, elements, rootRect) {
        const cell = clamp(Math.round(Math.min(rootRect.width, rootRect.height) / 45), 6, 14);
        const cols = Math.max(1, Math.ceil(rootRect.width / cell));
        const rows = Math.max(1, Math.ceil(rootRect.height / cell));
        if (cols * rows > 16000) return null;
        const grid = Array.from({ length: rows }, () => new Uint8Array(cols));
        const meaningful = elements.filter(element => {
            if (element === root) return false;
            if (isPrimaryInteractive(element) || isTextBearing(element)) return true;
            if (element.matches('.bar_display, hr, .toolbar, .light_manager_gradient_editor')) return true;
            return false;
        });
        meaningful.forEach(element => {
            const r = rectOf(element);
            const left = clamp(Math.floor((r.left - rootRect.left) / cell), 0, cols - 1);
            const right = clamp(Math.ceil((r.right - rootRect.left) / cell), 0, cols);
            const top = clamp(Math.floor((r.top - rootRect.top) / cell), 0, rows - 1);
            const bottom = clamp(Math.ceil((r.bottom - rootRect.top) / cell), 0, rows);
            for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) grid[y][x] = 1;
        });
        return { grid, cell, cols, rows };
    }

    function largestEmptyRect(gridData) {
        if (!gridData) return null;
        const { grid, cell, cols, rows } = gridData;
        const heights = new Array(cols).fill(0);
        let best = null;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) heights[x] = grid[y][x] ? 0 : heights[x] + 1;
            const stack = [];
            for (let x = 0; x <= cols; x++) {
                const h = x === cols ? 0 : heights[x];
                let start = x;
                while (stack.length && stack[stack.length - 1].height > h) {
                    const item = stack.pop();
                    const width = x - item.start;
                    const area = item.height * width;
                    if (!best || area > best.area) {
                        best = {
                            x: item.start * cell,
                            y: (y - item.height + 1) * cell,
                            width: width * cell,
                            height: item.height * cell,
                            area: area * cell * cell
                        };
                    }
                    start = item.start;
                }
                if (!stack.length || stack[stack.length - 1].height < h) stack.push({ start, height: h });
            }
        }
        return best;
    }

    function analyzeWhitespaceAndDensity(report, elements) {
        const root = report.target.element;
        const rootRect = report.targetRect;
        const gridData = occupancyGrid(root, elements, rootRect);
        const empty = largestEmptyRect(gridData);
        const rootArea = Math.max(1, rootRect.area);
        const controls = elements.filter(isPrimaryInteractive);
        const text = elements.filter(isTextBearing);
        const controlDensity = controls.length / (rootArea / 100000);

        if (empty && empty.area > rootArea * 0.11 && empty.width > 70 && empty.height > 40) {
            const rect = {
                left: rootRect.left + empty.x,
                top: rootRect.top + empty.y,
                right: rootRect.left + empty.x + empty.width,
                bottom: rootRect.top + empty.y + empty.height,
                width: empty.width,
                height: empty.height,
                area: empty.area
            };
            const nearBottom = empty.y + empty.height > rootRect.height * 0.88;
            const style = getComputedStyle(root);
            addIssue(report, {
                type: 'whitespace', severity: empty.area > rootArea * 0.25 ? 'warning' : 'info', element: root, rect,
                title: 'Large unused visual region',
                message: `About ${round(empty.area / rootArea * 100)}% of the target is one continuous empty region (${round(empty.width)}×${round(empty.height)} px).`,
                why: nearBottom
                    ? `The gap is mainly at the bottom; this often comes from fixed/min height or flex-grow (${style.flexGrow}) rather than useful breathing room.`
                    : 'This can be intentional grouping space, but a region this large is worth checking for an over-wide column, fixed size, or hidden content.',
                fix: 'If accidental, reduce fixed/min dimensions or redistribute controls. If intentional, keep it aligned with a clear section boundary so it reads as breathing room.',
                metrics: { emptyAreaRatio: round(empty.area / rootArea, 3), width: round(empty.width), height: round(empty.height) }
            });
        }

        if (controlDensity > 18 && controls.length >= 12) {
            addIssue(report, {
                type: 'density', severity: controlDensity > 28 ? 'warning' : 'info', element: root,
                title: 'High control density',
                message: `${controls.length} interactive controls occupy a ${round(rootRect.width)}×${round(rootRect.height)} px surface (${round(controlDensity, 1)} controls / 100k px²).`,
                why: 'Dense settings surfaces become slower to scan when every row has similar visual weight.',
                fix: 'Group related settings, collapse advanced controls, strengthen subsection headers, and keep rarely used actions secondary.',
                metrics: { controls: controls.length, density: round(controlDensity, 1) }
            });
        }

        const formBars = root.querySelectorAll('.form_bar').length;
        const headings = Array.from(root.querySelectorAll('.bar_display, h1, h2, h3, h4, .light_manager_form_variant_subsection')).filter(isVisible).length;
        if (formBars >= 15 && headings < 2) {
            addIssue(report, {
                type: 'hierarchy', severity: 'warning', element: root,
                title: 'Long form with weak visual grouping',
                message: `${formBars} form rows are visible but only ${headings} clear section/header elements were detected.`,
                why: 'Users must scan a long undifferentiated list instead of recognizing semantic groups.',
                fix: 'Insert subsection bars/group toggles at meaningful boundaries; avoid adding decoration without hierarchy.',
                metrics: { formBars, headings }
            });
        }

        report.metrics.density = {
            targetArea: round(rootArea),
            controls: controls.length,
            textElements: text.length,
            controlsPer100k: round(controlDensity, 1),
            largestEmptyAreaRatio: empty ? round(empty.area / rootArea, 3) : 0
        };
    }

    function analyzeAccessibility(report, elements) {
        const root = report.target.element;
        for (const element of elements) {
            if (element.matches('button, [role="button"], .tool, .light_manager_action_button')) {
                const text = elementText(element);
                const name = element.getAttribute('aria-label') || element.getAttribute('title') || text;
                if (!name && isInteractive(element)) {
                    addIssue(report, {
                        type: 'accessibility', severity: 'info', element,
                        title: 'Icon/action has no accessible name',
                        message: 'This interactive control has no visible text, title, or aria-label.',
                        why: 'Icon meaning can be ambiguous, and unnamed controls are difficult for assistive technology.',
                        fix: 'Add a concise title/aria-label even when the Material icon looks obvious.',
                        metrics: {}
                    });
                }
            }
            if (element.matches('input:not([type="hidden"]), select, textarea')) {
                const id = element.id;
                const label = id ? root.querySelector(`label[for="${cssEscape(id)}"]`) : null;
                const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby');
                const barLabel = element.closest('.form_bar')?.querySelector('label');
                if (!label && !aria && !barLabel) {
                    addIssue(report, {
                        type: 'accessibility', severity: 'info', element,
                        title: 'Input has no associated label',
                        message: 'No native label or ARIA label was detected for this input.',
                        why: 'The control is harder to identify semantically and may also indicate a visually detached label.',
                        fix: 'Use the FormElement label path, label[for], or aria-label/aria-labelledby.',
                        metrics: {}
                    });
                }
            }
        }
    }

    function analyzeFormConfiguration(report) {
        const targetObject = report.target.object;
        const form = targetObject?.form;
        const config = form?.form_config || targetObject?.form_config || null;
        if (!config || typeof config !== 'object') return;
        let count = 0;
        for (const [key, options] of Object.entries(config)) {
            if (!options || options === '_' || typeof options !== 'object') continue;
            count++;
            const labelValue = options.label ? (typeof tl === 'function' ? tl(options.label) : options.label) : '';
            const label = String(labelValue || '');
            const bar = report.target.element.querySelector(`.form_bar_${cssEscape(key)}`);
            if (label.length > 34 && options.full_width !== true) {
                addIssue(report, {
                    type: 'configuration', severity: label.length > 55 ? 'warning' : 'info', element: bar || report.target.element,
                    title: 'Long form label in configuration',
                    message: `Form key '${key}' uses a ${label.length}-character label: '${label.slice(0, 70)}${label.length > 70 ? '…' : ''}'.`,
                    why: 'Blockbench computes a shared max label width. One unusually long label can squeeze every control in the form.',
                    fix: 'Shorten the visible label and move detail into description/title, or intentionally make this field full-width.',
                    metrics: { key, labelLength: label.length, type: options.type || 'text' }
                });
            }
            if (options.type === 'range' && isFiniteNumber(options.min) && isFiniteNumber(options.max) && Number(options.max) <= Number(options.min)) {
                addIssue(report, {
                    type: 'configuration', severity: 'error', element: bar || report.target.element,
                    title: 'Invalid range bounds',
                    message: `Form key '${key}' has min ${options.min} and max ${options.max}.`,
                    why: 'The range cannot represent a useful interval.',
                    fix: 'Set max greater than min and verify step/value are inside the interval.',
                    metrics: { key, min: options.min, max: options.max }
                });
            }
        }
        report.metrics.formConfigFields = count;
    }

    function analyzeLayout(target) {
        if (!target?.element || !isVisible(target.element)) throw new Error('Selected UI target is not currently visible.');
        const root = target.element;
        const targetRect = rectOf(root);
        const report = {
            version: 1,
            generatedAt: new Date().toISOString(),
            blockbenchVersion: window.Blockbench?.version || '',
            devicePixelRatio: window.devicePixelRatio || 1,
            viewport: {
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            },
            target: { ...target, element: root, object: target.object },
            targetRect,
            summary: { total: 0, error: 0, warning: 0, info: 0 },
            metrics: {},
            issues: []
        };
        const elements = collectElements(root);
        report.metrics.elementCount = elements.length;
        report.metrics.targetSize = { width: round(targetRect.width), height: round(targetRect.height) };

        analyzeRootGeometry(report);
        analyzeClippingAndOverflow(report, elements);
        analyzeCollisions(report, elements);
        analyzeTypography(report, elements);
        analyzeContrast(report, elements);
        analyzeTargetSizesAndCentering(report, elements);
        analyzeFormAlignment(report);
        analyzeScrollbars(report, elements);
        analyzeWhitespaceAndDensity(report, elements);
        analyzeAccessibility(report, elements);
        analyzeFormConfiguration(report);

        report.issues.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.type.localeCompare(b.type));
        currentReport = report;
        state.report = report;
        return report;
    }

    function serializableReport(report) {
        if (!report) return null;
        return {
            version: report.version,
            generatedAt: report.generatedAt,
            blockbenchVersion: report.blockbenchVersion,
            viewport: report.viewport,
            target: {
                id: report.target.id,
                name: report.target.name,
                kind: report.target.kind,
                panelId: report.target.panelId || '',
                dialogId: report.target.dialogId || '',
                lightflow: !!report.target.lightflow
            },
            targetRect: relativeRect(report.targetRect, { left: 0, top: 0 }),
            summary: report.summary,
            metrics: report.metrics,
            issues: report.issues.map(({ element, ...issue }) => issue)
        };
    }

    function reportAsMarkdown(report) {
        const clean = serializableReport(report);
        if (!clean) return '';
        const lines = [
            `# Lightflow UI Diagnostics — ${clean.target.name}`,
            '',
            `Generated: ${clean.generatedAt}`,
            `Viewport: ${clean.viewport.width}×${clean.viewport.height} @ ${clean.viewport.devicePixelRatio}x`,
            `Target: ${clean.targetRect.width}×${clean.targetRect.height}`,
            `Issues: ${clean.summary.error} errors · ${clean.summary.warning} warnings · ${clean.summary.info} info`,
            ''
        ];
        clean.issues.forEach(issue => {
            lines.push(`## ${issue.id} · ${issue.severity.toUpperCase()} · ${issue.title}`);
            lines.push(issue.message);
            if (issue.sourceHint) lines.push(`Source hint: ${issue.sourceHint}`);
            if (issue.selector) lines.push(`Selector: \`${issue.selector}\``);
            if (issue.why) lines.push(`Why: ${issue.why}`);
            if (issue.fix) lines.push(`Fix: ${issue.fix}`);
            lines.push('');
        });
        return lines.join('\n');
    }

    function severityColor(severity) {
        if (severity === 'error') return '#ff4f64';
        if (severity === 'warning') return '#ffb020';
        return '#4ea1ff';
    }

    function clearOverlay() {
        currentOverlay?.remove?.();
        document.getElementById(OVERLAY_ID)?.remove();
        currentOverlay = null;
        state.overlayVisible = false;
    }

    function showOverlay(report = currentReport) {
        clearOverlay();
        if (!report) return;
        const rootRect = report.targetRect;
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000000;pointer-events:none;overflow:hidden;font-family:Arial,sans-serif;';

        report.issues.forEach(issue => {
            const color = severityColor(issue.severity);
            const box = document.createElement('div');
            box.dataset.issueId = issue.id;
            box.style.cssText = [
                'position:absolute',
                `left:${rootRect.left + issue.rect.x}px`,
                `top:${rootRect.top + issue.rect.y}px`,
                `width:${Math.max(2, issue.rect.width)}px`,
                `height:${Math.max(2, issue.rect.height)}px`,
                `border:2px ${issue.type === 'whitespace' ? 'dashed' : 'solid'} ${color}`,
                `background:${issue.type === 'whitespace' ? color + '12' : 'transparent'}`,
                'box-sizing:border-box',
                'border-radius:3px'
            ].join(';');
            const badge = document.createElement('span');
            badge.textContent = issue.id;
            badge.style.cssText = `position:absolute;left:-2px;top:-18px;height:17px;line-height:17px;padding:0 4px;border-radius:3px 3px 0 0;background:${color};color:#fff;font-size:10px;font-weight:700;white-space:nowrap;`;
            box.appendChild(badge);
            overlay.appendChild(box);
        });
        document.body.appendChild(overlay);
        currentOverlay = overlay;
        state.overlayVisible = true;
    }

    function flashIssue(issue) {
        if (!issue?.element?.isConnected) return;
        const rect = rectOf(issue.element);
        const marker = document.createElement('div');
        marker.style.cssText = `position:fixed;left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px;z-index:1000002;border:3px solid ${severityColor(issue.severity)};box-sizing:border-box;pointer-events:none;border-radius:4px;box-shadow:0 0 0 2px rgba(255,255,255,.8);transition:opacity .25s;`;
        document.body.appendChild(marker);
        issue.element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        setTimeout(() => { marker.style.opacity = '0'; }, 650);
        setTimeout(() => marker.remove(), 950);
    }

    function copyLiveState(source, clone) {
        const sourceNodes = [source, ...source.querySelectorAll('*')];
        const cloneNodes = [clone, ...clone.querySelectorAll('*')];
        sourceNodes.forEach((node, index) => {
            const copy = cloneNodes[index];
            if (!copy) return;
            if (node instanceof HTMLInputElement) {
                copy.setAttribute('value', node.value);
                if (node.checked) copy.setAttribute('checked', 'checked'); else copy.removeAttribute('checked');
            } else if (node instanceof HTMLTextAreaElement) {
                copy.textContent = node.value;
            } else if (node instanceof HTMLSelectElement) {
                Array.from(copy.options || []).forEach((option, optionIndex) => { option.selected = node.options[optionIndex]?.selected; });
            } else if (node instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
                try {
                    const img = document.createElement('img');
                    img.src = node.toDataURL();
                    img.width = node.clientWidth;
                    img.height = node.clientHeight;
                    copy.replaceWith(img);
                } catch (error) {}
            }
        });
    }

    function inlineComputedStyles(source, clone) {
        const sourceNodes = [source, ...source.querySelectorAll('*')];
        const cloneNodes = [clone, ...clone.querySelectorAll('*')];
        const properties = [
            'display','position','box-sizing','width','height','min-width','min-height','max-width','max-height',
            'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
            'border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style',
            'border-top-color','border-right-color','border-bottom-color','border-left-color','border-radius','background','background-color','background-image','background-size','background-position','background-repeat',
            'color','font-family','font-size','font-style','font-weight','font-variant','line-height','letter-spacing','text-align','text-transform','text-decoration','text-overflow','white-space','overflow-wrap','word-break',
            'opacity','visibility','overflow','overflow-x','overflow-y','flex','flex-grow','flex-shrink','flex-basis','flex-direction','flex-wrap','align-items','align-self','justify-content','gap','column-gap','row-gap',
            'grid-template-columns','grid-template-rows','grid-column','grid-row','place-items','object-fit','object-position','transform','transform-origin','box-shadow','filter','outline','vertical-align','cursor'
        ];
        sourceNodes.forEach((node, index) => {
            const copy = cloneNodes[index];
            if (!(node instanceof Element) || !(copy instanceof Element)) return;
            const style = getComputedStyle(node);
            const css = properties.map(prop => `${prop}:${style.getPropertyValue(prop)};`).join('');
            copy.setAttribute('style', css + (copy.getAttribute('style') || ''));
        });
    }

    function sanitizeCloneResources(clone) {
        const nodes = [clone, ...clone.querySelectorAll('*')];
        nodes.forEach(node => {
            if (!(node instanceof Element)) return;
            const tag = node.tagName.toLowerCase();

            // Standalone SVG/foreignObject snapshots become canvas-tainted as soon as
            // Chromium resolves a file://, http(s):// or blob: sub-resource inside the
            // cloned UI. Preserve geometry, but remove resources that can change the
            // origin-clean flag. data: URLs are kept because they are self-contained.
            ['srcset', 'poster'].forEach(attr => node.removeAttribute(attr));
            const src = node.getAttribute('src');
            if (src && !/^data:/i.test(src)) {
                node.removeAttribute('src');
                if (tag === 'img' || tag === 'video') node.style.visibility = 'hidden';
            }
            const dataAttr = node.getAttribute('data');
            if (dataAttr && !/^data:/i.test(dataAttr)) node.removeAttribute('data');

            for (const attr of ['href', 'xlink:href']) {
                const value = node.getAttribute(attr);
                if (value && !value.startsWith('#') && !/^data:/i.test(value)) node.removeAttribute(attr);
            }

            // Remove every CSS URL reference. background-color, borders, typography,
            // flex/grid geometry and all other computed properties remain intact.
            const style = node.style;
            for (let i = style.length - 1; i >= 0; i--) {
                const prop = style.item(i);
                const value = style.getPropertyValue(prop);
                if (/url\s*\(/i.test(value)) style.removeProperty(prop);
            }

            // Resource-hosting elements can still trigger loads through browser
            // defaults even after attributes are stripped. Keep their box footprint.
            if (['iframe', 'object', 'embed', 'source', 'track'].includes(tag)) {
                node.replaceChildren();
                node.style.visibility = 'hidden';
            }
        });
    }

    function serializeCloneForSvg(root, safeResources = false) {
        const clone = root.cloneNode(true);
        copyLiveState(root, clone);
        inlineComputedStyles(root, clone);
        if (safeResources) sanitizeCloneResources(clone);
        clone.removeAttribute('id');
        clone.style.margin = '0';
        clone.style.position = 'relative';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.transform = 'none';
        clone.style.width = `${root.getBoundingClientRect().width}px`;
        clone.style.height = `${root.getBoundingClientRect().height}px`;
        const serializer = new XMLSerializer();
        return serializer.serializeToString(clone);
    }

    function createCaptureCanvas(width, height, scale) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width * scale));
        canvas.height = Math.max(1, Math.ceil(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D is unavailable.');
        ctx.scale(scale, scale);
        return { canvas, ctx };
    }

    function canvasIsOriginClean(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            // Reading even one pixel is enough to detect a tainted canvas without
            // creating the very large base64 string produced by toDataURL().
            ctx.getImageData(0, 0, 1, 1);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function renderForeignObjectSnapshot(root, width, height, scale, safeResources) {
        const { canvas, ctx } = createCaptureCanvas(width, height, scale);
        const markup = serializeCloneForSvg(root, safeResources);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">${markup}</div></foreignObject></svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Chromium could not rasterize the DOM snapshot SVG.'));
                img.src = url;
            });
            ctx.drawImage(img, 0, 0, width, height);
            if (!canvasIsOriginClean(canvas)) {
                throw new DOMException('Snapshot referenced a resource that tainted the canvas.', 'SecurityError');
            }
            return canvas;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function renderGeometryFallback(report, width, height, scale) {
        const root = report.target.element;
        const rootRect = rectOf(root);
        const { canvas, ctx } = createCaptureCanvas(width, height, scale);
        const rootStyle = getComputedStyle(root);
        ctx.fillStyle = rootStyle.backgroundColor && rootStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
            ? rootStyle.backgroundColor
            : '#202020';
        ctx.fillRect(0, 0, width, height);

        // Draw a clean, deterministic approximation of the actually measured DOM.
        // This deliberately never paints external images/canvases, so it cannot taint.
        const elements = collectElements(root);
        for (const element of elements) {
            if (element === root) continue;
            const r = rectOf(element);
            const x = r.left - rootRect.left;
            const y = r.top - rootRect.top;
            const w = r.width;
            const h = r.height;
            if (w < 1 || h < 1 || x > width || y > height || x + w < 0 || y + h < 0) continue;
            const style = getComputedStyle(element);

            const bg = parseColor(style.backgroundColor);
            if (bg.a > 0.02) {
                ctx.fillStyle = style.backgroundColor;
                ctx.fillRect(x, y, w, h);
            }

            const borderWidth = Math.max(
                parseFloat(style.borderTopWidth) || 0,
                parseFloat(style.borderRightWidth) || 0,
                parseFloat(style.borderBottomWidth) || 0,
                parseFloat(style.borderLeftWidth) || 0
            );
            if (borderWidth > 0 && style.borderTopStyle !== 'none') {
                ctx.strokeStyle = style.borderTopColor || 'rgba(255,255,255,.2)';
                ctx.lineWidth = Math.min(2, Math.max(1, borderWidth));
                ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
            }

            if (isTextBearing(element)) {
                const text = elementText(element);
                if (text) {
                    const size = clamp(parseFloat(style.fontSize) || 12, 7, 28);
                    const weight = String(style.fontWeight || '400');
                    const family = (style.fontFamily || 'sans-serif').split(',')[0].replace(/["']/g, '') || 'sans-serif';
                    ctx.font = `${weight} ${size}px ${family}`;
                    ctx.fillStyle = style.color || '#fff';
                    ctx.textBaseline = 'middle';
                    const pad = Math.max(2, parseFloat(style.paddingLeft) || 0);
                    const maxWidth = Math.max(1, w - pad * 2);
                    let shown = text;
                    while (shown.length > 2 && ctx.measureText(shown).width > maxWidth) shown = shown.slice(0, -2);
                    if (shown !== text) shown = shown.replace(/\s+$/, '') + '…';
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, w, h);
                    ctx.clip();
                    ctx.fillText(shown, x + pad, y + h / 2, maxWidth);
                    ctx.restore();
                }
            }
        }

        ctx.fillStyle = 'rgba(0,0,0,.72)';
        ctx.fillRect(8, 8, Math.min(width - 16, 330), 24);
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('Safe geometry capture (external resources omitted)', 14, 20);
        canvas.dataset.captureMode = 'geometry';
        canvas.dataset.renderedDom = 'false';
        return canvas;
    }

    function annotateCapture(canvas, report, scale) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        // createCaptureCanvas already scaled the context. A canvas returned by the
        // foreignObject renderer is also created through that helper.
        ctx.save();
        report.issues.forEach(issue => {
            const color = severityColor(issue.severity);
            const x = issue.rect.x;
            const y = issue.rect.y;
            const w = Math.max(2, issue.rect.width);
            const h = Math.max(2, issue.rect.height);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            if (issue.type === 'whitespace') ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
            ctx.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
            ctx.setLineDash([]);
            ctx.font = 'bold 10px sans-serif';
            const badgeWidth = Math.max(28, ctx.measureText(issue.id).width + 8);
            ctx.fillStyle = color;
            ctx.fillRect(x, Math.max(0, y - 16), badgeWidth, 15);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(issue.id, x + 4, Math.max(11, y - 5));
        });
        ctx.restore();
        return canvas;
    }

    function waitForPaint(frames = 2) {
        return new Promise(resolve => {
            const step = () => {
                if (--frames <= 0) resolve();
                else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    function captureBlockbenchViewportDataUrl(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const screencam = window.Screencam;
            if (!(typeof isApp !== 'undefined' && isApp) || !screencam || typeof screencam.fullScreen !== 'function') {
                reject(new Error('Blockbench native interface capture is unavailable in this build.'));
                return;
            }
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Blockbench native interface capture timed out.'));
            }, timeoutMs);
            try {
                // This is Blockbench's own interface screenshot path. Internally it
                // calls Electron BrowserWindow.capturePage(), so the resulting pixels
                // are the *actual compositor output*: CSS, pseudo-elements, fonts,
                // Material/FontAwesome icons, native range controls, canvases, etc.
                screencam.fullScreen(0, dataUrl => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
                        reject(new Error('Blockbench returned an invalid interface screenshot.'));
                        return;
                    }
                    resolve(dataUrl);
                });
            } catch (error) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    async function loadImage(dataUrl) {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Could not decode Blockbench interface screenshot.'));
            img.src = dataUrl;
        });
        return img;
    }

    function setTemporaryVisibility(element, value, restoreList) {
        if (!(element instanceof HTMLElement)) return;
        const previous = element.style.visibility;
        element.style.visibility = value;
        restoreList.push(() => { element.style.visibility = previous; });
    }

    async function captureExactTarget(report) {
        const root = report.target.element;
        if (!(root instanceof HTMLElement) || !root.isConnected) {
            throw new Error('The analyzed target is no longer attached to the interface.');
        }

        // Freeze the geometry before hiding the inspector. The diagnostics panel is
        // floating, so visibility:hidden does not reflow the layout. This prevents
        // the tool itself and its issue overlay from appearing in the screenshot.
        const targetRect = root.getBoundingClientRect();
        const viewportWidth = Math.max(1, window.innerWidth);
        const viewportHeight = Math.max(1, window.innerHeight);
        const restore = [];
        let shield = null;

        try {
            if (currentOverlay) setTemporaryVisibility(currentOverlay, 'hidden', restore);
            if (diagnosticsPanel?.container && !diagnosticsPanel.container.contains(root) && !root.contains(diagnosticsPanel.container)) {
                setTemporaryVisibility(diagnosticsPanel.container, 'hidden', restore);
            }

            // Prevent the mouse from creating a new :hover state on the UI that was
            // underneath the floating diagnostics panel while it is temporarily hidden.
            shield = document.createElement('div');
            shield.setAttribute('aria-hidden', 'true');
            shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;pointer-events:auto;cursor:default;';
            document.body.appendChild(shield);
            restore.push(() => shield?.remove());

            if (document.activeElement && diagnosticsPanel?.container?.contains(document.activeElement)) {
                document.activeElement.blur?.();
            }

            await waitForPaint(2);
            const dataUrl = await captureBlockbenchViewportDataUrl();
            const source = await loadImage(dataUrl);

            // capturePage() returns the rendered Blockbench content at its real backing
            // resolution. Derive the scale from the image itself instead of trusting
            // devicePixelRatio, which keeps this correct on Windows fractional DPI and
            // mixed-DPI monitors.
            const scaleX = source.naturalWidth / viewportWidth;
            const scaleY = source.naturalHeight / viewportHeight;
            if (!(scaleX > 0) || !(scaleY > 0)) throw new Error('Invalid native screenshot scale.');

            const clipLeft = clamp(targetRect.left, 0, viewportWidth);
            const clipTop = clamp(targetRect.top, 0, viewportHeight);
            const clipRight = clamp(targetRect.right, 0, viewportWidth);
            const clipBottom = clamp(targetRect.bottom, 0, viewportHeight);
            if (clipRight <= clipLeft || clipBottom <= clipTop) {
                throw new Error('The selected UI is outside the visible Blockbench viewport.');
            }

            const sourceX = Math.round(clipLeft * scaleX);
            const sourceY = Math.round(clipTop * scaleY);
            const sourceW = Math.max(1, Math.round((clipRight - clipLeft) * scaleX));
            const sourceH = Math.max(1, Math.round((clipBottom - clipTop) * scaleY));

            const canvas = document.createElement('canvas');
            canvas.width = sourceW;
            canvas.height = sourceH;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D is unavailable.');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(source, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

            canvas.dataset.captureMode = 'blockbench-native';
            canvas.dataset.renderedDom = 'true';
            canvas.dataset.scaleX = String(scaleX);
            canvas.dataset.scaleY = String(scaleY);
            canvas.dataset.cssOffsetX = String(clipLeft - targetRect.left);
            canvas.dataset.cssOffsetY = String(clipTop - targetRect.top);
            return canvas;
        } finally {
            while (restore.length) {
                try { restore.pop()(); } catch (error) {}
            }
        }
    }

    function annotateNativeCapture(canvas, report) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        const scaleX = Number(canvas.dataset.scaleX) || 1;
        const scaleY = Number(canvas.dataset.scaleY) || scaleX;
        const offsetX = Number(canvas.dataset.cssOffsetX) || 0;
        const offsetY = Number(canvas.dataset.cssOffsetY) || 0;
        const lineScale = Math.max(1, Math.min(scaleX, scaleY));

        ctx.save();
        report.issues.forEach(issue => {
            const color = severityColor(issue.severity);
            const x = (issue.rect.x - offsetX) * scaleX;
            const y = (issue.rect.y - offsetY) * scaleY;
            const w = Math.max(2, issue.rect.width * scaleX);
            const h = Math.max(2, issue.rect.height * scaleY);
            if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) return;

            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(2, 2 * lineScale);
            if (issue.type === 'whitespace') ctx.setLineDash([5 * lineScale, 4 * lineScale]);
            else ctx.setLineDash([]);
            ctx.strokeRect(x + lineScale, y + lineScale, Math.max(1, w - 2 * lineScale), Math.max(1, h - 2 * lineScale));
            ctx.setLineDash([]);

            const fontSize = Math.max(10, 10 * lineScale);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const badgeWidth = Math.max(28 * lineScale, ctx.measureText(issue.id).width + 8 * lineScale);
            const badgeHeight = 15 * lineScale;
            const badgeY = Math.max(0, y - 16 * lineScale);
            ctx.fillStyle = color;
            ctx.fillRect(x, badgeY, badgeWidth, badgeHeight);
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(issue.id, x + 4 * lineScale, badgeY + 11 * lineScale);
        });
        ctx.restore();
        return canvas;
    }

    async function renderTargetToCanvas(report = currentReport, annotated = true) {
        if (!report?.target?.element) throw new Error('Run an analysis before capturing PNG.');
        const root = report.target.element;
        const rect = rectOf(root);
        const scale = clamp(window.devicePixelRatio || 1, 1, 2);
        const width = Math.max(1, Math.ceil(rect.width));
        const height = Math.max(1, Math.ceil(rect.height));

        // Desktop Blockbench must be pixel-exact. Never silently substitute a DOM
        // reconstruction here: if Blockbench's own compositor capture fails, surface
        // the failure so the user never mistakes an approximation for a screenshot.
        if (typeof isApp !== 'undefined' && isApp) {
            if (!window.Screencam?.fullScreen) {
                throw new Error('Exact PNG requires Blockbench Screencam.fullScreen(), but it is unavailable in this build.');
            }
            const nativeCanvas = await captureExactTarget(report);
            if (annotated) annotateNativeCapture(nativeCanvas, report);
            return nativeCanvas;
        }

        // Portable fallback for Blockbench Web. This is not
        // pixel-perfect because foreignObject cannot reproduce every Chromium/native
        // widget, but it keeps PNG export available when native capture is impossible.
        let canvas = null;
        let firstError = null;
        try {
            canvas = await renderForeignObjectSnapshot(root, width, height, scale, false);
            canvas.dataset.captureMode = 'dom-fallback';
            canvas.dataset.renderedDom = 'true';
        } catch (error) {
            firstError = error;
            console.warn('[Lightflow UI Diagnostics] Full DOM fallback was not export-safe; retrying without external resources.', error);
        }

        if (!canvas) {
            try {
                canvas = await renderForeignObjectSnapshot(root, width, height, scale, true);
                canvas.dataset.captureMode = 'sanitized-dom-fallback';
                canvas.dataset.renderedDom = 'true';
            } catch (error) {
                console.warn('[Lightflow UI Diagnostics] Sanitized DOM fallback unavailable; using clean geometry renderer.', error, firstError);
                canvas = renderGeometryFallback(report, width, height, scale);
            }
        }

        if (!canvasIsOriginClean(canvas)) {
            console.warn('[Lightflow UI Diagnostics] Fallback capture became tainted; replacing with geometry fallback.');
            canvas = renderGeometryFallback(report, width, height, scale);
        }

        if (annotated) annotateCapture(canvas, report, scale);
        return canvas;
    }

    async function exportPng(report = currentReport) {
        const canvas = await renderTargetToCanvas(report, true);
        if (!canvasIsOriginClean(canvas)) throw new Error('PNG capture could not be made origin-clean.');
        const dataUrl = canvas.toDataURL('image/png');
        const baseName = String(report.target.panelId || report.target.dialogId || 'ui').replace(/[^a-z0-9_-]+/gi, '_');
        Blockbench.export({
            type: 'PNG Image',
            extensions: ['png'],
            name: `lightflow_ui_diagnostics_${baseName}`,
            savetype: 'image',
            content: dataUrl
        });
        return dataUrl;
    }

    function exportJson(report = currentReport) {
        if (!report) throw new Error('Run an analysis before exporting.');
        const content = JSON.stringify(serializableReport(report), null, 2);
        const baseName = String(report.target.panelId || report.target.dialogId || 'ui').replace(/[^a-z0-9_-]+/gi, '_');
        Blockbench.export({
            type: 'JSON',
            extensions: ['json'],
            name: `lightflow_ui_diagnostics_${baseName}`,
            savetype: 'text',
            content
        });
        return content;
    }

    function copyReport(report = currentReport) {
        if (!report) throw new Error('Run an analysis before copying.');
        const text = reportAsMarkdown(report);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
        else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
        Blockbench.showQuickMessage?.('UI diagnostics report copied', 1800);
        return text;
    }

    async function auditTarget(targetId = selectedTargetId) {
        state.busy = true;
        state.lastError = '';
        try {
            clearOverlay();
            const target = getTargetById(targetId);
            if (!target) throw new Error('No visible Panel or Dialog could be found.');
            selectedTargetId = target.id;
            const report = analyzeLayout(target);
            refreshPanelVue();
            return report;
        } catch (error) {
            state.lastError = String(error?.message || error);
            console.error('[Lightflow UI Diagnostics]', error);
            Blockbench.showQuickMessage?.(`UI diagnostics: ${state.lastError}`, 3200);
            refreshPanelVue();
            return null;
        } finally {
            state.busy = false;
            refreshPanelVue();
        }
    }

    async function auditAllVisibleLightflow() {
        const targets = discoverTargets().filter(target => target.lightflow);
        const reports = [];
        clearOverlay();
        for (const target of targets) {
            try { reports.push(analyzeLayout(target)); } catch (error) { console.warn(error); }
        }
        if (!reports.length) throw new Error('No visible Lightflow Panel/Dialog was found in the current layout.');
        const combined = {
            generatedAt: new Date().toISOString(),
            targets: reports.map(serializableReport),
            summary: reports.reduce((acc, report) => {
                acc.total += report.summary.total;
                acc.error += report.summary.error;
                acc.warning += report.summary.warning;
                acc.info += report.summary.info;
                return acc;
            }, { total: 0, error: 0, warning: 0, info: 0 })
        };
        Blockbench.export({
            type: 'JSON', extensions: ['json'], savetype: 'text',
            name: 'lightflow_ui_diagnostics_all_visible',
            content: JSON.stringify(combined, null, 2)
        });
        currentReport = reports[0];
        state.report = currentReport;
        refreshPanelVue();
        return combined;
    }

    function refreshPanelVue() {
        if (!diagnosticsPanel?.vue) return;
        diagnosticsPanel.vue.targets = discoverTargets().map(target => ({ id: target.id, name: target.name, kind: target.kind, lightflow: target.lightflow }));
        diagnosticsPanel.vue.selectedTargetId = selectedTargetId;
        diagnosticsPanel.vue.report = state.report;
        diagnosticsPanel.vue.busy = state.busy;
        diagnosticsPanel.vue.overlayVisible = state.overlayVisible;
        diagnosticsPanel.vue.lastError = state.lastError;
    }

    function filteredIssues(report, severityFilter, typeFilter) {
        if (!report) return [];
        return report.issues.filter(issue =>
            (severityFilter === 'all' || issue.severity === severityFilter) &&
            (typeFilter === 'all' || issue.type === typeFilter)
        );
    }

    function createPanel() {
        diagnosticsPanel = new Panel(PANEL_ID, {
            name: 'UI Diagnostics',
            icon: 'troubleshoot',
            optional: true,
            condition: () => state.panelVisible === true,
            growable: true,
            resizable: true,
            expand_button: true,
            min_height: 260,
            default_position: {
                slot: 'float',
                float_position: [70, 80],
                float_size: [460, 650],
                height: 650,
                folded: false
            },
            component: {
                data() {
                    return {
                        targets: [],
                        selectedTargetId,
                        report: null,
                        busy: false,
                        overlayVisible: false,
                        severityFilter: 'all',
                        typeFilter: 'all',
                        lastError: ''
                    };
                },
                computed: {
                    issues() { return filteredIssues(this.report, this.severityFilter, this.typeFilter); },
                    issueTypes() {
                        if (!this.report) return [];
                        return Array.from(new Set(this.report.issues.map(issue => issue.type))).sort();
                    },
                    targetSummary() {
                        if (!this.report) return 'Choose a visible Panel or Dialog and analyze it.';
                        const s = this.report.summary;
                        return `${s.error} errors · ${s.warning} warnings · ${s.info} info`;
                    }
                },
                methods: {
                    refreshTargets() { refreshPanelVue(); },
                    analyze() { selectedTargetId = this.selectedTargetId; auditTarget(this.selectedTargetId); },
                    analyzeAll() { auditAllVisibleLightflow().catch(error => Blockbench.showQuickMessage?.(String(error.message || error), 2800)); },
                    toggleOverlay() {
                        if (state.overlayVisible) clearOverlay(); else showOverlay(this.report);
                        refreshPanelVue();
                    },
                    png() { exportPng(this.report).catch(error => Blockbench.showQuickMessage?.(`PNG capture failed: ${error.message || error}`, 3000)); },
                    json() { try { exportJson(this.report); } catch (error) { Blockbench.showQuickMessage?.(String(error.message || error), 2600); } },
                    copy() { try { copyReport(this.report); } catch (error) { Blockbench.showQuickMessage?.(String(error.message || error), 2600); } },
                    focusIssue(issue) { flashIssue(issue); },
                    severityClass(issue) { return `lfuid-severity-${issue.severity}`; },
                    typeLabel(type) { return issueLabels[type] || type; }
                },
                mounted() {
                    this.$nextTick(() => refreshPanelVue());
                },
                template: `
                    <div class="lfuid-root">
                        <div class="lfuid-toolbar">
                            <select class="lfuid-target-select" v-model="selectedTargetId" @focus="refreshTargets" title="Visible UI target">
                                <option value="auto">Auto-detect Lightflow target</option>
                                <option v-for="target in targets" :key="target.id" :value="target.id">{{ target.name }}</option>
                            </select>
                            <button class="lfuid-primary" @click="analyze" :disabled="busy" title="Analyze selected UI"><i class="material-icons">troubleshoot</i><span>Analyze</span></button>
                        </div>
                        <div class="lfuid-actions">
                            <button @click="refreshTargets" title="Refresh visible Panels and Dialogs"><i class="material-icons">refresh</i></button>
                            <button @click="toggleOverlay" :class="{active: overlayVisible}" :disabled="!report" title="Toggle issue overlay"><i class="material-icons">layers</i><span>Overlay</span></button>
                            <button @click="png" :disabled="!report" title="Capture exact annotated PNG from Blockbench pixels"><i class="material-icons">photo_camera</i><span>PNG</span></button>
                            <button @click="json" :disabled="!report" title="Export machine-readable report"><i class="material-icons">data_object</i><span>JSON</span></button>
                            <button @click="copy" :disabled="!report" title="Copy Markdown report"><i class="material-icons">content_copy</i></button>
                            <button @click="analyzeAll" title="Audit all visible Lightflow surfaces and export a combined JSON"><i class="material-icons">fact_check</i></button>
                        </div>

                        <div v-if="lastError" class="lfuid-error-banner">{{ lastError }}</div>
                        <div class="lfuid-summary" v-if="report">
                            <div>
                                <strong>{{ report.target.name }}</strong>
                                <span>{{ Math.round(report.targetRect.width) }}×{{ Math.round(report.targetRect.height) }} px · {{ report.metrics.elementCount }} elements</span>
                            </div>
                            <div class="lfuid-chips">
                                <span class="lfuid-chip error">{{ report.summary.error }} errors</span>
                                <span class="lfuid-chip warning">{{ report.summary.warning }} warnings</span>
                                <span class="lfuid-chip info">{{ report.summary.info }} info</span>
                            </div>
                        </div>
                        <div v-else class="lfuid-empty">
                            <i class="material-icons">view_quilt</i>
                            <strong>Runtime UI audit</strong>
                            <span>Detects clipping, collisions, overflow, text pressure, contrast, spacing, density, unused space, scroll and form-specific problems.</span>
                        </div>

                        <div class="lfuid-filters" v-if="report">
                            <select v-model="severityFilter" title="Severity filter">
                                <option value="all">All severities</option>
                                <option value="error">Errors</option>
                                <option value="warning">Warnings</option>
                                <option value="info">Info</option>
                            </select>
                            <select v-model="typeFilter" title="Issue type filter">
                                <option value="all">All issue types</option>
                                <option v-for="type in issueTypes" :key="type" :value="type">{{ typeLabel(type) }}</option>
                            </select>
                            <span>{{ issues.length }} shown</span>
                        </div>

                        <div class="lfuid-issue-list" v-if="report">
                            <button class="lfuid-issue" v-for="issue in issues" :key="issue.id" :class="severityClass(issue)" @click="focusIssue(issue)">
                                <div class="lfuid-issue-head">
                                    <span class="lfuid-issue-id">{{ issue.id }}</span>
                                    <span class="lfuid-issue-title">{{ issue.title }}</span>
                                    <span class="lfuid-issue-type">{{ typeLabel(issue.type) }}</span>
                                </div>
                                <div class="lfuid-issue-message">{{ issue.message }}</div>
                                <div class="lfuid-source" v-if="issue.sourceHint">{{ issue.sourceHint }}</div>
                                <div class="lfuid-fix" v-if="issue.fix"><i class="material-icons">build</i><span>{{ issue.fix }}</span></div>
                            </button>
                            <div class="lfuid-clean" v-if="issues.length === 0">No issues match the current filters.</div>
                        </div>
                    </div>
                `
            }
        });
        resources.push(diagnosticsPanel);
    }

    function addStyles() {
        const style = Blockbench.addCSS(`
            #panel_${PANEL_ID} {
                min-width: 0;
                overflow: hidden;
            }
            #panel_${PANEL_ID} .panel_vue_wrapper {
                min-width: 0;
                min-height: 0;
                height: 100%;
                overflow: hidden;
            }
            .lfuid-root {
                display: flex;
                flex-direction: column;
                min-width: 0;
                min-height: 0;
                height: 100%;
                padding: 8px;
                gap: 7px;
                box-sizing: border-box;
                color: var(--color-text);
                background: var(--color-ui);
                container-type: inline-size;
            }
            .lfuid-toolbar, .lfuid-actions, .lfuid-filters {
                display: flex;
                align-items: center;
                min-width: 0;
                gap: 6px;
            }
            .lfuid-target-select, .lfuid-filters select {
                min-width: 0;
                height: 30px;
                border: 1px solid var(--color-border);
                border-radius: 4px;
                background: var(--color-back);
                color: var(--color-text);
                padding: 0 7px;
                font: inherit;
            }
            .lfuid-target-select { flex: 1 1 auto; }
            .lfuid-toolbar button, .lfuid-actions button {
                min-height: 30px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                border: 1px solid var(--color-border);
                border-radius: 4px;
                padding: 0 8px;
                background: var(--color-button);
                color: var(--color-text);
                font: inherit;
                cursor: pointer;
            }
            .lfuid-toolbar button:hover, .lfuid-actions button:hover { background: var(--color-bright_ui); }
            .lfuid-toolbar button:disabled, .lfuid-actions button:disabled { opacity: .45; cursor: default; }
            .lfuid-toolbar .lfuid-primary { border-color: var(--color-accent); }
            .lfuid-actions { flex-wrap: wrap; }
            .lfuid-actions button { flex: 0 0 auto; }
            .lfuid-actions button.active { color: var(--color-accent); border-color: var(--color-accent); }
            .lfuid-actions i, .lfuid-toolbar i { font-size: 17px; }
            .lfuid-summary {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 8px;
                border: 1px solid var(--color-border);
                border-radius: 5px;
                background: color-mix(in srgb, var(--color-back) 72%, var(--color-ui));
            }
            .lfuid-summary > div:first-child { display:flex; justify-content:space-between; gap:8px; min-width:0; }
            .lfuid-summary strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .lfuid-summary span { color: var(--color-subtle_text); font-size: 11px; }
            .lfuid-chips { display:flex; flex-wrap:wrap; gap:5px; }
            .lfuid-chip { padding:2px 6px; border-radius:999px; font-size:10px !important; color:#fff !important; }
            .lfuid-chip.error { background:#d83b52; }
            .lfuid-chip.warning { background:#b87500; }
            .lfuid-chip.info { background:#2f75c7; }
            .lfuid-filters select { flex: 1 1 0; }
            .lfuid-filters > span { flex:0 0 auto; color:var(--color-subtle_text); font-size:11px; }
            .lfuid-issue-list { flex:1 1 auto; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:6px; padding-right:2px; scrollbar-gutter:stable; }
            .lfuid-issue {
                display:block;
                width:100%;
                min-width:0;
                padding:7px 8px;
                border:1px solid var(--color-border);
                border-left-width:3px;
                border-radius:4px;
                background:var(--color-back);
                color:var(--color-text);
                text-align:left;
                cursor:pointer;
                font:inherit;
            }
            .lfuid-issue:hover { background:var(--color-button); }
            .lfuid-severity-error { border-left-color:#ff4f64; }
            .lfuid-severity-warning { border-left-color:#ffb020; }
            .lfuid-severity-info { border-left-color:#4ea1ff; }
            .lfuid-issue-head { display:flex; align-items:center; min-width:0; gap:6px; }
            .lfuid-issue-id { flex:0 0 auto; font-size:10px; font-weight:700; color:var(--color-subtle_text); }
            .lfuid-issue-title { flex:1 1 auto; min-width:0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .lfuid-issue-type { flex:0 0 auto; font-size:10px; color:var(--color-subtle_text); }
            .lfuid-issue-message { margin-top:4px; color:var(--color-text); line-height:1.32; }
            .lfuid-source { margin-top:4px; color:var(--color-subtle_text); font:10px monospace; overflow-wrap:anywhere; }
            .lfuid-fix { display:flex; align-items:flex-start; gap:5px; margin-top:5px; color:var(--color-subtle_text); font-size:11px; line-height:1.3; }
            .lfuid-fix i { flex:0 0 auto; font-size:13px; margin-top:1px; }
            .lfuid-empty { flex:1 1 auto; min-height:130px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; padding:18px; text-align:center; color:var(--color-subtle_text); }
            .lfuid-empty > i { font-size:36px; color:var(--color-accent); }
            .lfuid-empty strong { color:var(--color-text); }
            .lfuid-clean { padding:16px; text-align:center; color:var(--color-subtle_text); }
            .lfuid-error-banner { padding:7px 8px; border-left:3px solid #ff4f64; background:color-mix(in srgb, #ff4f64 12%, var(--color-back)); border-radius:3px; }
            @container (max-width: 360px) {
                .lfuid-toolbar { flex-wrap:wrap; }
                .lfuid-target-select { flex-basis:100%; }
                .lfuid-toolbar button { flex:1 1 auto; }
                .lfuid-actions button span { display:none; }
                .lfuid-summary > div:first-child { flex-direction:column; }
                .lfuid-issue-type { display:none; }
            }
        `);
        resources.push(style);
    }

    function showPanel() {
        if (!diagnosticsPanel) return;
        state.panelVisible = true;
        diagnosticsPanel.update?.();
        try {
            // Keep diagnostics floating so opening it does not resize the layout being audited.
            if (diagnosticsPanel.slot !== 'float') diagnosticsPanel.moveTo?.('float');
            if (diagnosticsPanel.container?.classList.contains('folded')) diagnosticsPanel.fold?.();
            diagnosticsPanel.moveToFront?.();
            diagnosticsPanel.container?.classList.remove('hidden');
        } catch (error) {
            console.warn('[Lightflow UI Diagnostics] Could not focus panel', error);
        }
        refreshPanelVue();
    }

    function registerApi() {
        runtimeApi = Object.freeze({
            version: PLUGIN_VERSION,
            discoverTargets,
            analyze(targetId = 'auto') {
                const target = getTargetById(targetId);
                return target ? analyzeLayout(target) : null;
            },
            analyzeElement(element, options = {}) {
                if (!(element instanceof HTMLElement)) throw new TypeError('analyzeElement expects an HTMLElement');
                return analyzeLayout({ id: options.id || 'custom', name: options.name || 'Custom UI', kind: options.kind || 'custom', element, object: options.object || null, lightflow: !!options.lightflow });
            },
            getReport: () => serializableReport(currentReport),
            showOverlay: () => showOverlay(currentReport),
            clearOverlay,
            renderPng: () => renderTargetToCanvas(currentReport, true),
            reportMarkdown: () => reportAsMarkdown(currentReport)
        });
        window.LightflowUIDiagnostics = runtimeApi;
    }

    function cleanup() {
        clearOverlay();
        if (window.LightflowUIDiagnostics === runtimeApi) delete window.LightflowUIDiagnostics;
        runtimeApi = null;
        currentReport = null;
        state.report = null;
        resources.reverse().forEach(resource => {
            try {
                if (resource?.delete) resource.delete();
                else if (resource?.remove) resource.remove();
            } catch (error) {
                console.warn('[Lightflow UI Diagnostics] Cleanup warning', error);
            }
        });
        resources.length = 0;
        diagnosticsPanel = null;
        openAction = null;
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow UI Diagnostics',
        icon: 'troubleshoot',
        author: 'MidFord327',
        description: 'Inspect Blockbench Panels, Dialogs and Forms for clipping, overlap, overflow, typography, contrast, spacing, density, unused space and responsive layout problems. Includes pixel-exact annotated Blockbench PNG capture and JSON reports.',
        tags: ['Lightflow', 'UI', 'Developer Tools'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],
        onload() {
            cleanup();
            addStyles();
            createPanel();
            registerApi();

            openAction = new Action('open_lightflow_ui_diagnostics', {
                name: 'Lightflow UI Diagnostics',
                description: 'Audit visible Panels, Dialogs and Forms for layout and visual problems',
                icon: 'troubleshoot',
                category: 'view',
                click: showPanel
            });
            MenuBar.addAction(openAction, 'tools');
            resources.push(openAction);

            setTimeout(() => {
                discoverTargets();
                refreshPanelVue();
            }, 0);
        },
        onunload: cleanup
    });
})();
