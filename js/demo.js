/* ─── Controls ─── */
const easingSelect  = document.getElementById('easingSelect');
const durationRange = document.getElementById('durationRange');
const durationLabel = document.getElementById('durationLabel');

durationRange.addEventListener('input', () => {
    durationLabel.textContent = `${durationRange.value} ms`;
});

const DEFAULT_DURATION = 400;
const DEFAULT_EASING   = 'easeInOut';
const DEFAULT_DIR      = 'up';

function getSettings() {
    const duration = parseInt(durationRange?.value, 10);
    return {
        duration : isNaN(duration) ? DEFAULT_DURATION : duration,
        easing   : easingSelect?.value || DEFAULT_EASING
    };
}

/* ─── Persistent instances (keyed by element id) ─── */
const instances = new Map();

function getInstance(id) {
    if (!id) return null;
    if (!instances.has(id)) {
        const el = document.getElementById(id);
        if (!el) return null;
        instances.set(id, new CollapseTree(el));
    }
    return instances.get(id);
}

/* ─── Initial state — collapse panels whose button starts with data-open="false" ─── */
document.querySelectorAll('.btn-toggle[data-open="false"]').forEach(btn => {
    const id  = btn.dataset.target;
    const dir = btn.dataset.dir || DEFAULT_DIR;
    if (!id || instances.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    instances.set(id, new CollapseTree(el, dir));
});

/* ─── Toggle buttons ─── */
document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        const { duration, easing } = getSettings();
        const ct = getInstance(btn.dataset.target);
        if (!ct) return;

        const dir    = btn.dataset.dir  || DEFAULT_DIR;
        const isOpen = btn.dataset.open === 'true';

        ct.toggle(dir, duration, easing);

        btn.dataset.open = isOpen ? 'false' : 'true';
    });
});
