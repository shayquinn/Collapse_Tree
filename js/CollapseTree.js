(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────────────

    const DIRECTIONS = Object.freeze({
        'up':         { axis: 'vertical',   transformOrigin: 'center top',    moveDirection: { x: 0, y: 0 }, restoreFrom: { x: 0,  y: 0  } },
        'down':       { axis: 'vertical',   transformOrigin: 'center bottom', moveDirection: { x: 0, y: 1 }, restoreFrom: { x: 0,  y: -1 } },
        'left':       { axis: 'horizontal', transformOrigin: 'left center',   moveDirection: { x: 0, y: 0 }, restoreFrom: { x: 0,  y: 0  } },
        'right':      { axis: 'horizontal', transformOrigin: 'right center',  moveDirection: { x: 1, y: 0 }, restoreFrom: { x: -1, y: 0  } },
        'up-left':    { axis: 'both',       transformOrigin: 'left top',      moveDirection: { x: 0, y: 0 }, restoreFrom: { x: 0,  y: 0  } },
        'up-right':   { axis: 'both',       transformOrigin: 'right top',     moveDirection: { x: 1, y: 0 }, restoreFrom: { x: -1, y: 0  } },
        'down-left':  { axis: 'both',       transformOrigin: 'left bottom',   moveDirection: { x: 0, y: 1 }, restoreFrom: { x: 0,  y: -1 } },
        'down-right': { axis: 'both',       transformOrigin: 'right bottom',  moveDirection: { x: 1, y: 1 }, restoreFrom: { x: -1, y: -1 } },
    });

    const EASINGS = Object.freeze({
        linear    : 'linear',
        ease      : 'ease',
        easeIn    : 'cubic-bezier(0.42, 0, 1, 1)',
        easeOut   : 'cubic-bezier(0, 0, 0.58, 1)',
        easeInOut : 'cubic-bezier(0.42, 0, 0.58, 1)',
        bounce    : 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    });

    const VALID_DIRS = new Set(Object.keys(DIRECTIONS));
    const VALID_EAS  = new Set(Object.keys(EASINGS));

    // ── Module-private state ─────────────────────────────────────────────────
    // WeakMaps keep data off the DOM, prevent external mutation, and let the GC
    // collect entries automatically when elements are removed.

    const _styles   = new WeakMap(); // element  → saved style snapshot
    const _config   = new WeakMap(); // instance → declarative config
    const _registry = new WeakMap(); // element  → CollapseTree instance

    // ── Class ────────────────────────────────────────────────────────────────

    class CollapseTree {

        // Frozen references kept public for external inspection (e.g. building UIs).
        static directions = DIRECTIONS;
        static easings    = EASINGS;

        constructor(element, initialState = null) {
            if (!(element instanceof HTMLElement)) {
                throw new TypeError('CollapseTree: element must be an HTMLElement');
            }
            if (initialState !== null && !VALID_DIRS.has(initialState)) {
                throw new RangeError(`CollapseTree: invalid initialState "${initialState}"`);
            }
            this.element = element;
            if (initialState) {
                this.initialDirection = initialState;
                requestAnimationFrame(() => this.#setInitialCollapsedState(initialState));
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────

        #allElements() {
            return [this.element, ...this.element.querySelectorAll('*')];
        }

        #curve(easing) {
            return EASINGS[easing] ?? EASINGS.easeInOut;
        }

        // Temporarily makes a zero-size element visible so we can read its natural dimensions.
        #getHiddenDimensions(el) {
            const { visibility, position } = el.style;
            el.style.visibility = 'hidden';
            if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
            const { width, height } = window.getComputedStyle(el);
            el.style.visibility = visibility;
            el.style.position   = position;
            return { width, height };
        }

        #saveStyles(el, preserveDimensions = false) {
            if (_styles.has(el)) return;
            const cs = window.getComputedStyle(el);
            let width  = cs.width;
            let height = cs.height;

            if (preserveDimensions && (width === '0px' || height === '0px')) {
                ({ width, height } = this.#getHiddenDimensions(el));
            }

            _styles.set(el, {
                display         : cs.display,
                width, height,
                overflow        : cs.overflow,
                paddingTop      : cs.paddingTop,
                paddingBottom   : cs.paddingBottom,
                paddingLeft     : cs.paddingLeft,
                paddingRight    : cs.paddingRight,
                marginTop       : cs.marginTop,
                marginBottom    : cs.marginBottom,
                marginLeft      : cs.marginLeft,
                marginRight     : cs.marginRight,
                transition      : cs.transition,
                inlineWidth     : el.style.width,
                inlineHeight    : el.style.height,
                inlineTransform : el.style.transform,
                position        : cs.position,
                left            : cs.left,
                top             : cs.top,
                visibility      : cs.visibility,
            });
        }

        #storedDim(el, key) {
            return parseFloat(_styles.get(el)?.[key] ?? 0);
        }

        #applyTransform(el, cfg, w, h, isRestore = false) {
            const dir = isRestore ? cfg.restoreFrom : cfg.moveDirection;
            const x = dir.x * w;
            const y = dir.y * h;
            if (x !== 0 || y !== 0) {
                el.style.transform = `translate(${x}px, ${y}px)`;
            }
        }

        #applySizeCollapse(el, cfg) {
            const s = el.style;
            if (cfg.axis === 'vertical' || cfg.axis === 'both') {
                s.height        = '0';
                s.paddingTop    = '0';
                s.paddingBottom = '0';
                s.marginTop     = '0';
                s.marginBottom  = '0';
            }
            if (cfg.axis === 'horizontal' || cfg.axis === 'both') {
                s.width        = '0';
                s.paddingLeft  = '0';
                s.paddingRight = '0';
                s.marginLeft   = '0';
                s.marginRight  = '0';
            }
            s.overflow = 'hidden';
        }

        // Applies all saved properties except transform, which is handled by the
        // caller so it can be correctly animated as the transition target.
        #restoreStyles(el) {
            const sv = _styles.get(el);
            if (!sv) return;
            Object.assign(el.style, {
                display         : sv.display,
                width           : sv.width,
                height          : sv.height,
                overflow        : sv.overflow,
                paddingTop      : sv.paddingTop,
                paddingBottom   : sv.paddingBottom,
                paddingLeft     : sv.paddingLeft,
                paddingRight    : sv.paddingRight,
                marginTop       : sv.marginTop,
                marginBottom    : sv.marginBottom,
                marginLeft      : sv.marginLeft,
                marginRight     : sv.marginRight,
                position        : sv.position,
                left            : sv.left,
                top             : sv.top,
                visibility      : sv.visibility,
                transformOrigin : '',
            });
        }

        #setInitialCollapsedState(direction) {
            const cfg = DIRECTIONS[direction];
            const el  = this.element;
            this.#saveStyles(el, true);
            const w  = this.#storedDim(el, 'width');
            const h  = this.#storedDim(el, 'height');
            if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
            if (cfg.axis === 'vertical'   || cfg.axis === 'both') el.style.height = `${h}px`;
            if (cfg.axis === 'horizontal' || cfg.axis === 'both') el.style.width  = `${w}px`;
            this.#applyTransform(el, cfg, w, h, true);
            this.#applySizeCollapse(el, cfg);
            el.style.transformOrigin = cfg.transformOrigin;
            el.dataset.collapsed = direction;
        }

        // ── Animation ────────────────────────────────────────────────────────

        #doCollapse(elements, direction, cfg, duration, curve) {
            elements.forEach(el => {
                this.#saveStyles(el);
                const cs = window.getComputedStyle(el);
                const w  = parseFloat(cs.width);
                const h  = parseFloat(cs.height);
                // Pin dimensions so content (e.g. images) doesn't reflow during animation.
                el.style.width  = cs.width;
                el.style.height = cs.height;
                if (cs.position === 'static') el.style.position = 'relative';
                el.style.transformOrigin = cfg.transformOrigin;
                void el.offsetHeight; // force reflow before transition starts
                el.style.transition = `all ${duration}ms ${curve}`;
                this.#applyTransform(el, cfg, w, h);
                this.#applySizeCollapse(el, cfg);
            });
            this.element.dataset.collapsed = direction;
            setTimeout(() => {
                elements.forEach(el => {
                    const sv = _styles.get(el);
                    if (sv?.transition === 'none') el.style.transition = '';
                });
            }, duration);
        }

        #doRestore(elements, cfg, duration, curve) {
            elements.forEach(el => {
                const sv = _styles.get(el);
                if (!sv) return;
                el.style.transformOrigin = cfg.transformOrigin;
                void el.offsetHeight; // force reflow before transition starts
                el.style.transition = `all ${duration}ms ${curve}`;
                this.#restoreStyles(el);
                // Animate transform back to the element's original inline value (or none).
                el.style.transform = sv.inlineTransform || '';
            });
            setTimeout(() => {
                elements.forEach(el => {
                    const sv = _styles.get(el);
                    if (!sv) return;
                    el.style.width      = sv.inlineWidth  || '';
                    el.style.height     = sv.inlineHeight || '';
                    el.style.transition = '';
                    _styles.delete(el);
                });
                delete this.element.dataset.collapsed;
            }, duration);
        }

        // ── Public API ───────────────────────────────────────────────────────

        transition(direction = 'up', duration = 300, easing = 'easeInOut') {
            const collapsedDir = this.element.dataset.collapsed;
            const target = collapsedDir ?? direction;
            if (!VALID_DIRS.has(target)) {
                console.error(`CollapseTree: invalid direction "${target}"`);
                return;
            }
            const cfg      = DIRECTIONS[target];
            const elements = this.#allElements();
            const curve    = this.#curve(easing);
            if (collapsedDir) {
                this.#doRestore(elements, cfg, duration, curve);
            } else {
                this.#doCollapse(elements, direction, cfg, duration, curve);
            }
        }

        collapse(direction = 'up', duration = 300, easing = 'easeInOut') {
            if (!this.element.dataset.collapsed) {
                this.transition(direction, duration, easing);
            }
        }

        restore(duration = 300, easing = 'easeInOut') {
            const dir = this.element.dataset.collapsed;
            if (dir) this.transition(dir, duration, easing);
        }

        toggle(direction = 'up', duration = 300, easing = 'easeInOut') {
            this.transition(direction, duration, easing);
        }

        get isCollapsed() {
            return !!this.element.dataset.collapsed;
        }

        // ── Static helpers ───────────────────────────────────────────────────

        /** Returns the CollapseTree instance bound to an element, or null. */
        static get(element) {
            return _registry.get(element) ?? null;
        }

        // ── Declarative / auto-init ──────────────────────────────────────────

        static #parseTokens(tokens) {
            let i = 0, direction = null, easing = null, duration = null, state = 'open';

            // Try two-token compound direction first (up-left → ['up','left'] after class split).
            if (tokens.length >= 2 && VALID_DIRS.has(`${tokens[0]}-${tokens[1]}`)) {
                direction = `${tokens[0]}-${tokens[1]}`; i = 2;
            } else if (VALID_DIRS.has(tokens[0])) {
                direction = tokens[0]; i = 1;
            }

            if (i < tokens.length && VALID_EAS.has(tokens[i]))      easing   = tokens[i++];
            if (i < tokens.length && /^\d+$/.test(tokens[i]))       duration = parseInt(tokens[i++], 10);
            if (i < tokens.length && (tokens[i] === 'open' || tokens[i] === 'closed')) state = tokens[i];

            return { direction, easing, duration, state };
        }

        static #parseClass(cls) {
            if (!cls.startsWith('collapse-')) return null;
            return CollapseTree.#parseTokens(cls.slice(9).split('-'));
        }

        static #parseAttr(value) {
            const [d = '', e = '', ms = '', st = ''] = value.trim().split(/\s+/);
            return {
                direction : VALID_DIRS.has(d)  ? d               : null,
                easing    : VALID_EAS.has(e)   ? e               : null,
                duration  : /^\d+$/.test(ms)   ? parseInt(ms, 10) : null,
                state     : st === 'closed'    ? 'closed'        : 'open',
            };
        }

        static #initElement(el, raw, idMap) {
            if (!raw?.direction || _registry.has(el)) return;
            const cfg = {
                direction : raw.direction,
                easing    : raw.easing   ?? 'easeInOut',
                duration  : raw.duration ?? 300,
                state     : raw.state    ?? 'open',
            };
            const instance = new CollapseTree(el, cfg.state === 'closed' ? cfg.direction : null);
            _config.set(instance, cfg);
            _registry.set(el, instance);
            if (el.id) idMap.set(el.id, instance);
        }

        /**
         * Scans `root` for panels with a `collapse-*` class or `data-collapse` attribute,
         * instantiates CollapseTree on each, and wires `[data-collapse-trigger]` buttons.
         * Returns a Map of { panelId → instance } for all panels that have an id.
         * Called automatically on DOMContentLoaded; safe to call again on dynamic content.
         */
        static autoInit(root = document) {
            const idMap = new Map();

            // data-collapse attribute takes priority when both are present.
            root.querySelectorAll('[data-collapse]').forEach(el =>
                CollapseTree.#initElement(el, CollapseTree.#parseAttr(el.dataset.collapse), idMap)
            );

            root.querySelectorAll('[class*="collapse-"]').forEach(el => {
                if (_registry.has(el)) return;
                for (const cls of el.classList) {
                    const parsed = CollapseTree.#parseClass(cls);
                    if (parsed?.direction) { CollapseTree.#initElement(el, parsed, idMap); break; }
                }
            });

            root.querySelectorAll('[data-collapse-trigger]').forEach(btn => {
                const sel    = btn.dataset.collapseTrigger;
                const target = root.getElementById(sel) ?? root.querySelector(sel);
                const inst   = target ? _registry.get(target) : null;
                if (!inst) return;
                const cfg = _config.get(inst);
                btn.addEventListener('click', () => {
                    inst.toggle(cfg.direction, cfg.duration, cfg.easing);
                    btn.dataset.open = btn.dataset.open === 'true' ? 'false' : 'true';
                });
            });

            return idMap;
        }
    }

    document.addEventListener('DOMContentLoaded', () => CollapseTree.autoInit());
    window.CollapseTree = CollapseTree;

})();
