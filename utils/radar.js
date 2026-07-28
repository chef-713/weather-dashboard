/**
 * Radar Map Controller — Leaflet + RainViewer
 *
 * Renders an interactive, pannable/zoomable radar map with an animated
 * past + near-term nowcast loop, layered over an OpenStreetMap base map.
 *
 * Requires Leaflet to be loaded globally (via CDN script tag in index.html)
 * before this module's functions are called.
 */

const ANIMATION_DELAY_MS = 900;
const FADE_MS = 350;

let map = null;
let radarTileLayer = null;
let frames = [];       // combined past + nowcast frames, each { time, url, isForecast }
let frameIndex = 0;
let playing = false;
let timer = null;
let fetchFramesFn = null; // injected: () => Promise<{past, nowcast}>

let els = {}; // DOM refs for controls, set in init()

/**
 * Create the Leaflet map once. Safe to call multiple times; subsequent
 * calls just recenter.
 */
export function initMap(containerId, lat, lon) {
    if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load — radar map unavailable.');
        return false;
    }

    if (!map) {
        map = L.map(containerId, {
            zoomControl: true,
            attributionControl: true
        }).setView([lat, lon], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 12,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        L.marker([lat, lon]).addTo(map);

        // Leaflet computes its tile grid from the container's size at the
        // moment L.map() runs. If the container hasn't finished layout/CSS yet,
        // it gets the wrong size and renders blank/grey tiles that never
        // self-correct. Forcing a resize check shortly after fixes it.
        requestAnimationFrame(() => map.invalidateSize());
        setTimeout(() => map.invalidateSize(), 250);

        window.addEventListener('resize', () => map.invalidateSize());
    } else {
        recenter(lat, lon);
    }
    return true;
}

export function recenter(lat, lon) {
    if (!map) return;
    map.setView([lat, lon], map.getZoom());
}

/**
 * Force Leaflet to recompute its container size. Needed whenever the map's
 * container was hidden (display:none via the [hidden] attribute) at the
 * time it was initialized or resized — e.g. the Radar tab isn't visible on
 * first load, so the map is born inside a zero-size box. Call this right
 * after making the container visible.
 */
export function refreshSize() {
    if (!map) return;
    map.invalidateSize();
}

/**
 * Wire up the play/pause/prev/next controls and the timestamp label.
 * Call once after the DOM elements exist.
 */
export function bindControls({ playBtn, prevBtn, nextBtn, timestampEl }) {
    els = { playBtn, prevBtn, nextBtn, timestampEl };

    playBtn.addEventListener('click', () => (playing ? pause() : play()));
    prevBtn.addEventListener('click', () => {
        pause();
        showFrame(frameIndex - 1);
    });
    nextBtn.addEventListener('click', () => {
        pause();
        showFrame(frameIndex + 1);
    });
}

/**
 * Fetch fresh radar frames (call on initial load and on manual refresh).
 * `getRadarFrames` should be state.api.getRadarFrames.bind(state.api) or similar.
 */
export async function loadFrames(getRadarFrames) {
    fetchFramesFn = getRadarFrames;
    const { past = [], nowcast = [] } = await getRadarFrames();

    frames = [
        ...past.map(f => ({ ...f, isForecast: false })),
        ...nowcast.map(f => ({ ...f, isForecast: true }))
    ];

    if (!frames.length) {
        if (els.timestampEl) els.timestampEl.textContent = 'Radar unavailable';
        return;
    }

    // Start on the most recent *observed* frame (last of "past"), not a forecast frame.
    frameIndex = Math.max(past.length - 1, 0);
    showFrame(frameIndex);
}

export async function refreshFrames() {
    if (fetchFramesFn) await loadFrames(fetchFramesFn);
}

function showFrame(index) {
    if (!map || !frames.length) return;
    frameIndex = ((index % frames.length) + frames.length) % frames.length;
    const frame = frames[frameIndex];

    const oldLayer = radarTileLayer;

    // Add the new frame at opacity 0, then fade it in — much less jarring
    // than an instant swap, given the underlying data only updates every
    // 10 minutes (that cadence itself can't be changed, it's how often
    // RainViewer generates new radar composites).
    const newLayer = L.tileLayer(frame.url, { opacity: 0, zIndex: 10, maxNativeZoom: 7 }).addTo(map);
    radarTileLayer = newLayer;

    requestAnimationFrame(() => {
        const el = newLayer.getContainer();
        if (el) {
            el.style.transition = `opacity ${FADE_MS}ms linear`;
        }
        // Use Leaflet's own setOpacity (not raw DOM style) so its internal
        // opacity state matches — otherwise Leaflet resets the container's
        // opacity back to the original `0` option value whenever tiles finish
        // loading, which is what caused the "fades in then vanishes" bug.
        newLayer.setOpacity(0.7);
    });

    if (oldLayer) {
        setTimeout(() => map.removeLayer(oldLayer), FADE_MS + 50);
    }

    if (els.timestampEl) {
        const d = new Date(frame.time * 1000);
        const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        els.timestampEl.textContent = frame.isForecast ? `${label} (forecast)` : label;
    }
}

function play() {
    if (!frames.length) return;
    playing = true;
    if (els.playBtn) els.playBtn.textContent = '⏸';
    timer = setInterval(() => showFrame(frameIndex + 1), ANIMATION_DELAY_MS);
}

function pause() {
    playing = false;
    if (els.playBtn) els.playBtn.textContent = '▶';
    clearInterval(timer);
    timer = null;
}