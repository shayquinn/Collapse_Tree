(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────────────

    const DIRECTIONS = Object.freeze({
        'up':         { axis: 'vertical',   transformOrigin: 'center top',    moveDirection: { x: 0, y: -1 }, restoreFrom: { x: 0,  y: 1  } },
        'down':       { axis: 'vertical',   transformOrigin: 'center bottom', moveDirection: { x: 0, y: 1  }, restoreFrom: { x: 0,  y: -1 } },
        'left':       { axis: 'horizontal', transformOrigin: 'left center',   moveDirection: { x: -1, y: 0 }, restoreFrom: { x: 1,  y: 0  } },
        'right':      { axis: 'horizontal', transformOrigin: 'right center',  moveDirection: { x: 1,  y: 0 }, restoreFrom: { x: -1, y: 0  } },
        'up-left':    { axis: 'both',       transformOrigin: 'left top',      moveDirection: { x: -1, y: -1 }, restoreFrom: { x: 1,  y: 1  } },
        'up-right':   { axis: 'both',       transformOrigin: 'right top',     moveDirection: { x: 1,  y: -1 }, restoreFrom: { x: -1, y: 1  } },
        'down-left':  { axis: 'both',       transformOrigin: 'left bottom',   moveDirection: { x: -1, y: 1  }, restoreFrom: { x: 1,  y: -1 } },
        'down-right': { axis: 'both',       transformOrigin: 'right bottom',  moveDirection: { x: 1,  y: 1  }, restoreFrom: { x: -1, y: -1 } },
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

    const _styles   = new WeakMap();
    const _config   = new WeakMap();
    const _registry = new WeakMap();
    const _anim     = new WeakMap();

    // ── Class ────────────────────────────────────────────────────────────────

    class CollapseTree {

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

        #saveStyles(el, preserveDimensions = false) {
            if (_styles.has(el)) return;
            const cs = window.getComputedStyle(el);
            
            _styles.set(el, {
                display           : cs.display,
                width             : cs.width,
                height            : cs.height,
                overflow          : cs.overflow,
                paddingTop        : cs.paddingTop,
                paddingBottom     : cs.paddingBottom,
                paddingLeft       : cs.paddingLeft,
                paddingRight      : cs.paddingRight,
                marginTop         : cs.marginTop,
                marginBottom      : cs.marginBottom,
                marginLeft        : cs.marginLeft,
                marginRight       : cs.marginRight,
                borderTopWidth    : cs.borderTopWidth,
                borderBottomWidth : cs.borderBottomWidth,
                borderLeftWidth   : cs.borderLeftWidth,
                borderRightWidth  : cs.borderRightWidth,
                inlineWidth       : el.style.width,
                inlineHeight      : el.style.height,
                inlineTransform   : el.style.transform,
                inlineTransition  : el.style.transition,
                position          : cs.position,
                left              : cs.left,
                top               : cs.top,
                visibility        : cs.visibility,
            });
        }

        #storedDim(el, key) {
            return parseFloat(_styles.get(el)?.[key] ?? 0);
        }

        #applyTransformScale(el, cfg, scaleX, scaleY, isRestore = false) {
            const dir = isRestore ? cfg.restoreFrom : cfg.moveDirection;
            
            if (cfg.axis === 'both') {
                // For diagonal directions, scale based on direction
                const xScale = dir.x === -1 ? scaleX : (dir.x === 1 ? scaleX : 1);
                const yScale = dir.y === -1 ? scaleY : (dir.y === 1 ? scaleY : 1);
                el.style.transform = `scale(${xScale}, ${yScale})`;
            } else if (cfg.axis === 'vertical') {
                // For vertical directions, scale Y only
                const yScale = dir.y === -1 ? scaleY : (dir.y === 1 ? scaleY : 0);
                el.style.transform = `scale(1, ${yScale})`;
            } else if (cfg.axis === 'horizontal') {
                // For horizontal directions, scale X only
                const xScale = dir.x === -1 ? scaleX : (dir.x === 1 ? scaleX : 0);
                el.style.transform = `scale(${xScale}, 1)`;
            }
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
                display           : sv.display,
                width             : sv.width,
                height            : sv.height,
                overflow          : sv.overflow,
                paddingTop        : sv.paddingTop,
                paddingBottom     : sv.paddingBottom,
                paddingLeft       : sv.paddingLeft,
                paddingRight      : sv.paddingRight,
                marginTop         : sv.marginTop,
                marginBottom      : sv.marginBottom,
                marginLeft        : sv.marginLeft,
                marginRight       : sv.marginRight,
                borderTopWidth    : sv.borderTopWidth,
                borderBottomWidth : sv.borderBottomWidth,
                borderLeftWidth   : sv.borderLeftWidth,
                borderRightWidth  : sv.borderRightWidth,
                position          : sv.position,
                left              : sv.left,
                top               : sv.top,
                visibility        : sv.visibility,
            });
        }

        #setInitialCollapsedState(direction) {
            const cfg = DIRECTIONS[direction];
            const el  = this.element;
            
            // Save original styles
            this.#saveStyles(el, true);
            
            const w = this.#storedDim(el, 'width');
            const h = this.#storedDim(el, 'height');
            
            if (window.getComputedStyle(el).position === 'static') {
                el.style.position = 'relative';
            }
            
            // Set transform origin
            el.style.transformOrigin = cfg.transformOrigin;
            
            // Apply collapsed state based on axis
            if (cfg.axis === 'both') {
                el.style.transform = `scale(0, 0)`;
                this.#applySizeCollapse(el, cfg);
            } else if (cfg.axis === 'vertical') {
                el.style.transform = `scale(1, 0)`;
                el.style.height = `${h}px`;
            } else if (cfg.axis === 'horizontal') {
                el.style.transform = `scale(0, 1)`;
                el.style.width = `${w}px`;
            }
            
            el.style.overflow = 'hidden';
            el.dataset.collapsed = direction;
        }

        // ── Animation ────────────────────────────────────────────────────────

        #snapToCollapsed(elements) {
            const cfg = _anim.get(this)?.cfg;
            if (!cfg) return;
            
            elements.forEach(el => {
                el.style.transition = 'none';
                void el.offsetHeight;
                
                if (cfg.axis === 'both') {
                    el.style.transform = `scale(0, 0)`;
                    this.#applySizeCollapse(el, cfg);
                } else if (cfg.axis === 'vertical') {
                    el.style.transform = `scale(1, 0)`;
                    el.style.height = '0';
                    el.style.paddingTop = '0';
                    el.style.paddingBottom = '0';
                } else if (cfg.axis === 'horizontal') {
                    el.style.transform = `scale(0, 1)`;
                    el.style.width = '0';
                    el.style.paddingLeft = '0';
                    el.style.paddingRight = '0';
                }
                
                const sv = _styles.get(el);
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
                el.style.transform       = sv.inlineTransform  || '';
                el.style.width           = sv.inlineWidth      || '';
                el.style.height          = sv.inlineHeight     || '';
                el.style.transition      = sv.inlineTransition || '';
                el.style.transformOrigin = '';
                _styles.delete(el);
            });
            delete this.element.dataset.collapsed;
        }

        #cancelAnimation(elements) {
            const state = _anim.get(this);
            if (!state?.timer) return;
            
            clearTimeout(state.timer);
            if (state.phase === 'restoring') {
                this.#snapToRestored(elements);
            } else {
                this.#snapToCollapsed(elements);
            }
            _anim.delete(this);
        }

        #doCollapse(elements, direction, cfg, duration, curve) {
            elements.forEach(el => {
                this.#saveStyles(el);
                const cs = window.getComputedStyle(el);
                const w = parseFloat(cs.width);
                const h = parseFloat(cs.height);
                
                // Pin dimensions to prevent reflow
                el.style.width = cs.width;
                el.style.height = cs.height;
                
                if (cs.position === 'static') {
                    el.style.position = 'relative';
                }
                
                el.style.transformOrigin = cfg.transformOrigin;
                void el.offsetHeight;
                
                el.style.transition = `all ${duration}ms ${curve}`;
                
                // Apply transform based on axis
                if (cfg.axis === 'both') {
                    el.style.transform = `scale(0, 0)`;
                    this.#applySizeCollapse(el, cfg);
                } else if (cfg.axis === 'vertical') {
                    el.style.transform = `scale(1, 0)`;
                    el.style.height = '0';
                    el.style.paddingTop = '0';
                    el.style.paddingBottom = '0';
                    el.style.marginTop = '0';
                    el.style.marginBottom = '0';
                } else if (cfg.axis === 'horizontal') {
                    el.style.transform = `scale(0, 1)`;
                    el.style.width = '0';
                    el.style.paddingLeft = '0';
                    el.style.paddingRight = '0';
                    el.style.marginLeft = '0';
                    el.style.marginRight = '0';
                }
                
                el.style.overflow = 'hidden';
            });
            
            this.element.dataset.collapsed = direction;
            
            _anim.set(this, {
                phase: 'collapsing',
                cfg,
                timer: setTimeout(() => {
                    elements.forEach(el => {
                        const sv = _styles.get(el);
                        if (!sv) return;
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
                
                el.style.transformOrigin = cfg.transformOrigin;
                void el.offsetHeight;
                
                el.style.transition = `all ${duration}ms ${curve}`;
                this.#restoreStyles(el);
                
                // Restore transform to original
                if (cfg.axis === 'both') {
                    el.style.transform = sv.inlineTransform || 'scale(1, 1)';
                } else {
                    el.style.transform = sv.inlineTransform || '';
                }
            });
            
            _anim.set(this, {
                phase: 'restoring',
                cfg,
                timer: setTimeout(() => {
                    elements.forEach(el => {
                        const sv = _styles.get(el);
                        if (!sv) return;
                        el.style.width           = sv.inlineWidth      || '';
                        el.style.height          = sv.inlineHeight     || '';
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
            const elements = this.#allElements();
            this.#cancelAnimation(elements);

            const collapsedDir = this.element.dataset.collapsed;
            const target = collapsedDir ?? direction;
            
            if (!VALID_DIRS.has(target)) {
                console.error(`CollapseTree: invalid direction "${target}"`);
                return;
            }
            
            const cfg = DIRECTIONS[target];
            const curve = this.#curve(easing);
            
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