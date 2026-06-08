(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────────────

    const DIRECTIONS = Object.freeze({
        'up':         { axis: 'vertical',   moveDirection: { x: 0,  y: -1 }, restoreFrom: { x: 0,  y: 1  } },
        'down':       { axis: 'vertical',   moveDirection: { x: 0,  y: 1  }, restoreFrom: { x: 0,  y: -1 } },
        'left':       { axis: 'horizontal', moveDirection: { x: -1, y: 0  }, restoreFrom: { x: 1,  y: 0  } },
        'right':      { axis: 'horizontal', moveDirection: { x: 1,  y: 0  }, restoreFrom: { x: -1, y: 0  } },
        'up-left':    { axis: 'both',       moveDirection: { x: -1, y: -1 }, restoreFrom: { x: 1,  y: 1  } },
        'up-right':   { axis: 'both',       moveDirection: { x: 1,  y: -1 }, restoreFrom: { x: -1, y: 1  } },
        'down-left':  { axis: 'both',       moveDirection: { x: -1, y: 1  }, restoreFrom: { x: 1,  y: -1 } },
        'down-right': { axis: 'both',       moveDirection: { x: 1,  y: 1  }, restoreFrom: { x: -1, y: -1 } },
    });

    const EASINGS = Object.freeze({
        linear: 'linear',
        ease: 'ease',
        easeIn: 'cubic-bezier(0.42, 0, 1, 1)',
        easeOut: 'cubic-bezier(0, 0, 0.58, 1)',
        easeInOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    });

    const VALID_DIRS = new Set(Object.keys(DIRECTIONS));
    const VALID_EAS = new Set(Object.keys(EASINGS));

    // ── Module-private state ─────────────────────────────────────────────────

    const _styles = new WeakMap();
    const _config = new WeakMap();
    const _registry = new WeakMap();
    const _anim = new WeakMap();

    // ── Class ────────────────────────────────────────────────────────────────

    class CollapseTree {

        static directions = DIRECTIONS;
        static easings = EASINGS;

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

        #curve(easing) {
            return EASINGS[easing] ?? EASINGS.easeInOut;
        }

        #saveStyles(el, preserveDimensions = false) {
            if (_styles.has(el)) return;
            const cs = window.getComputedStyle(el);

            _styles.set(el, {
                display: cs.display,
                width: cs.width,
                height: cs.height,
                overflow: cs.overflow,
                paddingTop: cs.paddingTop,
                paddingBottom: cs.paddingBottom,
                paddingLeft: cs.paddingLeft,
                paddingRight: cs.paddingRight,
                marginTop: cs.marginTop,
                marginBottom: cs.marginBottom,
                marginLeft: cs.marginLeft,
                marginRight: cs.marginRight,
                borderTopWidth: cs.borderTopWidth,
                borderBottomWidth: cs.borderBottomWidth,
                borderLeftWidth: cs.borderLeftWidth,
                borderRightWidth: cs.borderRightWidth,
                inlineWidth: el.style.width,
                inlineHeight: el.style.height,
                inlineTransform: el.style.transform,
                inlineTransition: el.style.transition,
                position: cs.position,
                left: cs.left,
                top: cs.top,
                visibility: cs.visibility,
            });
        }

        #storedDim(el, key) {
            return parseFloat(_styles.get(el)?.[key] ?? 0);
        }

        // Returns the fully-collapsed transform for an element.
        // transformOrigin must be '0 0' (top-left) for this to be correct.
        // translate(tx, ty) pins the far edge: for right/down the element slides toward its anchor
        // edge while scaling to zero, keeping the collapse edge visually stationary throughout.
        #collapseTransform(cfg, w, h) {
            const tx = cfg.moveDirection.x === 1 ? w : 0;
            const ty = cfg.moveDirection.y === 1 ? h : 0;
            const sx = cfg.axis === 'vertical'   ? 1 : 0;
            const sy = cfg.axis === 'horizontal' ? 1 : 0;
            const t  = (tx || ty) ? `translate(${tx}px, ${ty}px) ` : '';
            return `${t}scale(${sx}, ${sy})`;
        }

        #applySizeCollapse(el, cfg) {
            const s = el.style;

            // Always set overflow to hidden for collapsing
            s.overflow = 'hidden';

            // For both axes, we need to ensure dimensions are set to 0
            if (cfg.axis === 'both') {
                s.width = '0';
                s.height = '0';
                s.paddingTop = '0';
                s.paddingBottom = '0';
                s.paddingLeft = '0';
                s.paddingRight = '0';
                s.marginTop = '0';
                s.marginBottom = '0';
                s.marginLeft = '0';
                s.marginRight = '0';
            }
        }

        #restoreStyles(el) {
            const sv = _styles.get(el);
            if (!sv) return;

            // Restore all original styles
            Object.assign(el.style, {
                display: sv.display,
                width: sv.width,
                height: sv.height,
                overflow: sv.overflow,
                paddingTop: sv.paddingTop,
                paddingBottom: sv.paddingBottom,
                paddingLeft: sv.paddingLeft,
                paddingRight: sv.paddingRight,
                marginTop: sv.marginTop,
                marginBottom: sv.marginBottom,
                marginLeft: sv.marginLeft,
                marginRight: sv.marginRight,
                borderTopWidth: sv.borderTopWidth,
                borderBottomWidth: sv.borderBottomWidth,
                borderLeftWidth: sv.borderLeftWidth,
                borderRightWidth: sv.borderRightWidth,
                position: sv.position,
                left: sv.left,
                top: sv.top,
                visibility: sv.visibility,
            });
        }

        #setInitialCollapsedState(direction) {
            const cfg = DIRECTIONS[direction];
            const el  = this.element;

            this.#saveStyles(el, true);

            const w = this.#storedDim(el, 'width');
            const h = this.#storedDim(el, 'height');

            if (window.getComputedStyle(el).position === 'static') {
                el.style.position = 'relative';
            }

            el.style.overflow        = 'hidden';
            el.style.transformOrigin = '0 0';
            el.style.transform       = this.#collapseTransform(cfg, w, h);

            if (cfg.axis === 'vertical' || cfg.axis === 'both') {
                el.style.height        = '0';
                el.style.paddingTop    = '0';
                el.style.paddingBottom = '0';
                el.style.marginTop     = '0';
                el.style.marginBottom  = '0';
            }
            if (cfg.axis === 'horizontal' || cfg.axis === 'both') {
                el.style.width         = '0';
                el.style.paddingLeft   = '0';
                el.style.paddingRight  = '0';
                el.style.marginLeft    = '0';
                el.style.marginRight   = '0';
            }

            el.dataset.collapsed = direction;
        }

        // ── Animation ────────────────────────────────────────────────────────

        #snapToCollapsed(elements) {
            const cfg = _anim.get(this)?.cfg;
            if (!cfg) return;

            elements.forEach(el => {
                const w = this.#storedDim(el, 'width');
                const h = this.#storedDim(el, 'height');
                const sv = _styles.get(el);

                el.style.transition      = 'none';
                el.style.transformOrigin = '0 0';
                el.style.transform       = this.#collapseTransform(cfg, w, h);

                if (cfg.axis === 'vertical' || cfg.axis === 'both') {
                    el.style.height        = '0';
                    el.style.paddingTop    = '0';
                    el.style.paddingBottom = '0';
                    el.style.marginTop     = '0';
                    el.style.marginBottom  = '0';
                }
                if (cfg.axis === 'horizontal' || cfg.axis === 'both') {
                    el.style.width         = '0';
                    el.style.paddingLeft   = '0';
                    el.style.paddingRight  = '0';
                    el.style.marginLeft    = '0';
                    el.style.marginRight   = '0';
                }

                el.style.transition = sv ? sv.inlineTransition : '';
            });
        }

        #snapToRestored(elements) {
            elements.forEach(el => {
                const sv = _styles.get(el);
                if (!sv) return;

                el.style.transition = 'none';
                void el.offsetHeight;

                this.#restoreStyles(el);
                el.style.transform = sv.inlineTransform || '';
                el.style.width = sv.inlineWidth || '';
                el.style.height = sv.inlineHeight || '';
                el.style.transition = sv.inlineTransition || '';
                el.style.transformOrigin = '';
                _styles.delete(el);
            });
            delete this.element.dataset.collapsed;
        }

        #cancelAnimation() {
            const state = _anim.get(this);
            if (!state?.timer) return;

            clearTimeout(state.timer);
            if (state.phase === 'restoring') {
                this.#snapToRestored([this.element]);
            } else {
                this.#snapToCollapsed([this.element]);
            }
            _anim.delete(this);
        }

        #doCollapse(elements, direction, cfg, duration, curve) {
            elements.forEach(el => {
                this.#saveStyles(el);
                const cs = window.getComputedStyle(el);
                const w  = parseFloat(cs.width);
                const h  = parseFloat(cs.height);

                el.style.width  = cs.width;
                el.style.height = cs.height;

                if (cs.position === 'static') el.style.position = 'relative';

                el.style.overflow        = 'hidden';
                el.style.transformOrigin = '0 0';
                void el.offsetHeight;

                el.style.transition = `transform ${duration}ms ${curve}`;
                el.style.transform  = this.#collapseTransform(cfg, w, h);
            });

            this.element.dataset.collapsed = direction;

            _anim.set(this, {
                phase: 'collapsing',
                cfg,
                timer: setTimeout(() => {
                    elements.forEach(el => {
                        const sv = _styles.get(el);
                        if (!sv) return;
                        el.style.transition = 'none';
                        if (cfg.axis === 'vertical' || cfg.axis === 'both') {
                            el.style.height        = '0';
                            el.style.paddingTop    = '0';
                            el.style.paddingBottom = '0';
                            el.style.marginTop     = '0';
                            el.style.marginBottom  = '0';
                        }
                        if (cfg.axis === 'horizontal' || cfg.axis === 'both') {
                            el.style.width         = '0';
                            el.style.paddingLeft   = '0';
                            el.style.paddingRight  = '0';
                            el.style.marginLeft    = '0';
                            el.style.marginRight   = '0';
                        }
                        el.style.transition = sv.inlineTransition || '';
                    });
                    _anim.delete(this);
                }, duration),
            });
        }

        #doRestore(elements, cfg, duration, curve) {
            elements.forEach(el => {
                const sv = _styles.get(el);
                if (!sv) return;

                const w = parseFloat(sv.width);
                const h = parseFloat(sv.height);

                // Snap layout back first so surrounding content adjusts before the visual reveal
                el.style.transition = 'none';
                this.#restoreStyles(el);
                el.style.width  = sv.inlineWidth  || '';
                el.style.height = sv.inlineHeight || '';

                el.style.transformOrigin = '0 0';
                el.style.transform       = this.#collapseTransform(cfg, w, h);
                void el.offsetHeight;

                el.style.transition = `transform ${duration}ms ${curve}`;
                el.style.transform  = sv.inlineTransform || '';
            });

            _anim.set(this, {
                phase: 'restoring',
                cfg,
                timer: setTimeout(() => {
                    elements.forEach(el => {
                        const sv = _styles.get(el);
                        if (!sv) return;
                        el.style.transition      = sv.inlineTransition || '';
                        el.style.transformOrigin = '';
                        _styles.delete(el);
                    });
                    delete this.element.dataset.collapsed;
                    _anim.delete(this);
                }, duration),
            });
        }

        // ── Public API ───────────────────────────────────────────────────────

        transition(direction = 'up', duration = 300, easing = 'easeInOut') {
            this.#cancelAnimation();

            const collapsedDir = this.element.dataset.collapsed;
            const target = collapsedDir ?? direction;

            if (!VALID_DIRS.has(target)) {
                console.error(`CollapseTree: invalid direction "${target}"`);
                return;
            }

            const cfg = DIRECTIONS[target];
            const curve = this.#curve(easing);

            if (collapsedDir) {
                this.#doRestore([this.element], cfg, duration, curve);
            } else {
                this.#doCollapse([this.element], direction, cfg, duration, curve);
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

        static get(element) {
            return _registry.get(element) ?? null;
        }

        static #parseTokens(tokens) {
            let i = 0, direction = null, easing = null, duration = null, state = 'open';

            if (tokens.length >= 2 && VALID_DIRS.has(`${tokens[0]}-${tokens[1]}`)) {
                direction = `${tokens[0]}-${tokens[1]}`; i = 2;
            } else if (VALID_DIRS.has(tokens[0])) {
                direction = tokens[0]; i = 1;
            }

            if (i < tokens.length && VALID_EAS.has(tokens[i])) easing = tokens[i++];
            if (i < tokens.length && /^\d+$/.test(tokens[i])) duration = parseInt(tokens[i++], 10);
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
                direction: VALID_DIRS.has(d) ? d : null,
                easing: VALID_EAS.has(e) ? e : null,
                duration: /^\d+$/.test(ms) ? parseInt(ms, 10) : null,
                state: st === 'closed' ? 'closed' : 'open',
            };
        }

        static #initElement(el, raw, idMap) {
            if (!raw?.direction || _registry.has(el)) return;
            const cfg = {
                direction: raw.direction,
                easing: raw.easing ?? 'easeInOut',
                duration: raw.duration ?? 300,
                state: raw.state ?? 'open',
            };
            const instance = new CollapseTree(el, cfg.state === 'closed' ? cfg.direction : null);
            _config.set(instance, cfg);
            _registry.set(el, instance);
            if (el.id) idMap.set(el.id, instance);
        }

        static autoInit(root = document) {
            const idMap = new Map();

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
                const sel = btn.dataset.collapseTrigger;
                const target = root.getElementById(sel) ?? root.querySelector(sel);
                const inst = target ? _registry.get(target) : null;
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