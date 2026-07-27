/**
 * Weather Dashboard - Main Application Entry Point
 * 
 * Single-page weather app using Open-Meteo + ECCC + RainViewer
 * Vanilla ES modules, no build step required
 */

import WeatherAPI from './utils/api.js';
import * as storage from './utils/storage.js';
import * as dom from './utils/dom.js';
import * as radar from './utils/radar.js';

// ============================================================================
// State
// ============================================================================

const state = {
  api: null,
  location: null,
  units: 'metric',
  theme: 'system',
  data: null,
  loading: false,
  error: null
};

// ============================================================================
// DOM Element Cache
// ============================================================================

const els = {};

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  // Cache DOM elements first
  cacheElements();

  // Load preferences
  state.units = storage.prefs.getUnits();
  state.theme = storage.prefs.getTheme();
  applyTheme(state.theme);

  // Initialize API client (no key needed — Open-Meteo, ECCC, and RainViewer
  // are all free/anonymous on the tier this app uses)
  state.api = new WeatherAPI();

  // Set up event listeners
  setupEventListeners();

  // Load location (cached or geolocation) but do not fetch weather inside loadLocation
  await loadLocation(false);

  // Initial render
  updateUnitsButton();
  updateThemeButton();

  // Fetch weather
  if (state.location) {
    await fetchWeather(state.location.lat, state.location.lon);
  }

  // Set up radar map
  if (state.location) {
    initRadar(state.location.lat, state.location.lon);
  }

  // Set up Today/Week/Radar tabs
  setupTabs();

  console.log('Weather Dashboard initialized');
}

const TABS = ['today', 'week', 'radar'];

function setupTabs() {
  TABS.forEach(name => {
    document.getElementById(`tab-${name}`).addEventListener('click', () => activateTab(name));
  });
}

function activateTab(name) {
  TABS.forEach(t => {
    const isActive = t === name;
    document.getElementById(`tab-${t}`).classList.toggle('active', isActive);
    document.getElementById(`tab-${t}`).setAttribute('aria-selected', String(isActive));
    document.getElementById(`panel-${t}`).hidden = !isActive;
  });

  // The radar panel starts hidden (Today is the default tab), so Leaflet
  // initializes its map inside a zero-size container. Same underlying issue
  // as the earlier "grey tiles on first load" bug — force a size recheck
  // the moment the panel actually becomes visible.
  if (name === 'radar') {
    radar.refreshSize();
  }
}

function initRadar(lat, lon) {
  const mapReady = radar.initMap('radar-map', lat, lon);
  if (!mapReady) return;

  radar.bindControls({
    playBtn: document.getElementById('radar-play'),
    prevBtn: document.getElementById('radar-prev'),
    nextBtn: document.getElementById('radar-next'),
    timestampEl: document.getElementById('radar-timestamp')
  });

  radar.loadFrames(() => state.api.getRadarFrames());
}

function cacheElements() {
  // Sections
  els.currentSection = document.getElementById('current-section');
  els.currentContent = document.getElementById('current-content');
  els.hourlySection = document.getElementById('hourly-section');
  els.hourlyContent = document.getElementById('hourly-content');
  els.dailySection = document.getElementById('daily-section');
  els.dailyContent = document.getElementById('daily-content');

  // Controls
  els.locationBtn = document.getElementById('location-btn');
  els.locationName = document.getElementById('location-name');
  els.locationInput = document.getElementById('location-input');
  els.unitsToggle = document.getElementById('units-toggle');
  els.themeToggle = document.getElementById('theme-toggle');
  els.refreshBtn = document.getElementById('refresh-btn');
  els.apiCount = document.getElementById('api-count');
  els.errorBanner = document.getElementById('error-banner');

  // Show section titles
  document.getElementById('current-title').style.display = 'block';
  document.getElementById('hourly-title').style.display = 'block';
  document.getElementById('daily-title').style.display = 'block';
}

function setupEventListeners() {
  // Location
  els.locationBtn.addEventListener('click', () => detectLocation(true));

  // Search on Enter key only (no debounced input)
  els.locationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchLocation(e.target.value);
    }
  });

  // Units
  els.unitsToggle.addEventListener('click', toggleUnits);

  // Theme
  els.themeToggle.addEventListener('click', toggleTheme);

  // Refresh
  els.refreshBtn.addEventListener('click', () => {
    if (state.location) {
      fetchWeather(state.location.lat, state.location.lon);
      radar.refreshFrames();
    }
  });

  // Keyboard shortcuts (restored default reload Ctrl/Cmd+R behavior)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      toggleUnits();
    }
  });

  // System theme change
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (state.theme === 'system') applyTheme('system');
  });
}

// ============================================================================
// Location Handling
// ============================================================================

async function loadLocation(fetchAfter = true) {
  // Try cached location first
  const cached = storage.prefs.getLastLocation();
  if (cached && cached.lat && cached.lon) {
    state.location = cached;
    updateLocationDisplay(cached.name || `${cached.lat.toFixed(2)}, ${cached.lon.toFixed(2)}`);
    return;
  }

  // Detect location
  await detectLocation(fetchAfter);
}

async function detectLocation(fetchAfter = true) {
  if (!navigator.geolocation) {
    showError('Geolocation not supported. Please search for a location.');
    setLocationLoading(false);
    return;
  }

  setLocationLoading(true);

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000
      });
    });

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    // Get location name
    const name = await reverseGeocode(lat, lon);

    state.location = { lat, lon, name };
    storage.prefs.setLastLocation(state.location);

    updateLocationDisplay(name);
    setLocationLoading(false);
    radar.recenter(lat, lon);
    if (fetchAfter) {
      await fetchWeather(lat, lon);
    }

  } catch (err) {
    console.warn('Geolocation failed:', err);
    setLocationLoading(false);

    // Fallback to San Francisco
    state.location = { lat: 37.7749, lon: -122.4194, name: 'San Francisco, CA' };
    storage.prefs.setLastLocation(state.location);
    updateLocationDisplay('San Francisco, CA (default)');
    radar.recenter(state.location.lat, state.location.lon);
    if (fetchAfter) {
      await fetchWeather(state.location.lat, state.location.lon);
    }
  }
}

function setLocationLoading(loading) {
  if (loading) {
    els.locationName.textContent = 'Detecting…';
    els.locationBtn.disabled = true;
    els.locationBtn.classList.add('loading');
  } else {
    els.locationBtn.disabled = false;
    els.locationBtn.classList.remove('loading');
  }
}

function updateLocationDisplay(name) {
  els.locationName.textContent = name;
}

async function searchLocation(query) {
  if (!query || query.trim().length < 2) return;
  query = query.trim();

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&email=weatherapp@example.com`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await response.json();

    if (!results.length) {
      dom.toast('Location not found', 'error');
      return;
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const name = result.display_name.split(',').slice(0, 3).join(', ');

    state.location = { lat, lon, name };
    storage.prefs.setLastLocation(state.location);
    updateLocationDisplay(name);
    els.locationInput.value = '';
    els.locationInput.blur();
    radar.recenter(lat, lon);
    await fetchWeather(lat, lon);

  } catch (err) {
    console.error('Location search failed:', err);
    dom.toast('Search failed', 'error');
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&email=weatherapp@example.com`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await response.json();

    const parts = [];
    const addr = data.address || {};
    if (addr.city) parts.push(addr.city);
    else if (addr.town) parts.push(addr.town);
    else if (addr.village) parts.push(addr.village);
    else if (addr.suburb) parts.push(addr.suburb);
    else if (addr.road) parts.push(addr.road);

    if (addr.state) parts.push(addr.state);
    else if (addr.country) parts.push(addr.country);

    return parts.length ? parts.join(', ') : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

// ============================================================================
// Weather Fetching
// ============================================================================

async function fetchWeather(lat, lon) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  hideError();
  showLoading(true);

  // Render skeletons immediately to visually reflect active loading state
  renderSkeletons();

  try {
    const { current, hourly, daily } = await state.api.getAllWeather(lat, lon);
    state.data = { current, hourly, daily };

    // Save successfully fetched weather data in localStorage for offline caching
    try {
      const cachePayload = {
        weather: state.data,
        location: state.location,
        timestamp: Date.now()
      };
      localStorage.setItem('weather-dashboard:lastWeatherData', JSON.stringify(cachePayload));
    } catch (e) {
      console.warn('Failed to save weather data to persistent cache:', e);
    }

    renderAll();
    updateApiCount();
  } catch (err) {
    state.error = err.message;
    console.error('Weather fetch error:', err);

    // Attempt to load offline cache
    let cacheLoaded = false;
    try {
      const rawCache = localStorage.getItem('weather-dashboard:lastWeatherData');
      if (rawCache) {
        const cachedPayload = JSON.parse(rawCache);
        if (cachedPayload.weather) {
          state.data = cachedPayload.weather;
          state.location = cachedPayload.location;
          updateLocationDisplay(state.location.name);
          renderAll();

          const timeStr = new Date(cachedPayload.timestamp).toLocaleString();
          showError(`⚠️ Offline. Displaying cached weather data from ${timeStr}.`, true);
          cacheLoaded = true;
        }
      }
    } catch (cacheErr) {
      console.error('Failed to parse offline weather cache:', cacheErr);
    }

    if (!cacheLoaded) {
      showError(`Failed to load weather: ${err.message}`);
    }
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

function showLoading(show) {
  // Could add a spinner overlay here
  els.refreshBtn.disabled = show;
  if (show) els.refreshBtn.classList.add('loading');
  else els.refreshBtn.classList.remove('loading');
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  if (!state.location) return;
  if (!state.data) {
    renderSkeletons();
    return;
  }

  renderCurrent(state.data.current);
  renderHourly(state.data.hourly?.hourlyForecasts || []);
  renderDaily(state.data.daily?.dailyForecasts || []);
}

function renderSkeletons() {
  els.currentContent.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    els.currentContent.appendChild(dom.skeleton('current-skeleton'));
  }

  els.hourlyContent.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    els.hourlyContent.appendChild(dom.skeleton('hourly-skeleton'));
  }

  els.dailyContent.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    els.dailyContent.appendChild(dom.skeleton('daily-skeleton'));
  }
}

function renderCurrent(current) {
  if (!current) return;

  const temp = current.temperature?.degrees ?? 0;
  const feelsLike = current.feelsLikeTemperature?.degrees ?? temp;
  const humidity = current.humidity ?? 0;
  const windSpeed = current.wind?.speed?.value ?? 0;
  const windDir = current.wind?.direction?.degrees ?? 0;
  const pressure = current.pressure?.value ?? 0;
  const visibility = current.visibility?.value ?? 0;
  const uvIndex = current.uvIndex?.value ?? 0;
  const precip = current.precipitation?.value ?? 0;
  const conditionCode = current.conditionCode || 'UNKNOWN';
  const isDaytime = current.isDaytime ?? true;
  const obsTime = current.observationTime;
  // Today's rain chance, for the glance strip — pulled from the first
  // upcoming hourly entry so it reflects "today," not just this instant.
  const todayPrecipProb = state.data?.hourly?.hourlyForecasts?.[0]?.precipitationProbability ?? 0;

  const icon = dom.getWeatherIcon(conditionCode, isDaytime);
  const conditionText = dom.getConditionText(conditionCode);
  const tempClass = dom.tempColorClass(temp);

  els.currentContent.innerHTML = '';
  els.currentContent.append(
    // Glance strip — temp, condition, rain chance, nothing else.
    // Lets you get the gist without scanning the full detail grid below.
    dom.el('div', { class: 'current-summary' }, [
      dom.el('span', { class: `current-summary-temp ${tempClass}` }, dom.formatTemp(temp, state.units)),
      dom.el('span', { class: 'current-summary-condition' }, conditionText),
      todayPrecipProb > 0.1
        ? dom.el('span', { class: 'current-summary-precip' }, `${Math.round(todayPrecipProb * 100)}% rain`)
        : null
    ].filter(Boolean)),
    dom.el('div', { class: 'current-card' }, [
      // Header
      dom.el('div', { class: 'current-header' }, [
        dom.el('div', { class: 'current-icon' }, icon),
        dom.el('div', { class: `current-temp ${tempClass}` }, dom.formatTemp(temp, state.units)),
        dom.el('div', { class: 'current-condition' }, conditionText),
        dom.el('div', { class: 'current-feels' }, [
          dom.detailIcon('feelsLike'),
          ` Feels like ${dom.formatTemp(feelsLike, state.units)}`
        ])
      ]),
      // Details — fixed 3x2 icon grid, always fully visible. One box per
      // stat, no duplicate of "Feels like" (already shown above).
      dom.el('div', { class: 'current-details' }, [
        detailItem('humidity', 'Humidity', `${humidity}%`),
        detailItem('wind', 'Wind', `${dom.formatWind(windSpeed, state.units)} ${windDir}°`),
        detailItem('pressure', 'Pressure', dom.formatPressure(pressure, state.units)),
        detailItem('visibility', 'Visibility', dom.formatVisibility(visibility, state.units)),
        detailItem('precipitation', 'Precipitation', dom.formatPrecip(precip, state.units)),
        detailItem('uv', 'UV Index', `${uvIndex} (${current.uvIndex?.category || 'N/A'})`)
      ]),
      // Timestamp
      obsTime && dom.el('div', { class: 'current-updated' }, `Updated ${dom.formatTime(obsTime)}`)
    ].filter(Boolean))
  );
}

function detailItem(iconKey, label, value) {
  return dom.el('div', { class: 'detail-item' }, [
    dom.el('div', { class: 'detail-icon' }, dom.detailIcon(iconKey)),
    dom.el('span', { class: 'detail-label' }, label),
    dom.el('span', { class: 'detail-value' }, value)
  ]);
}

function renderHourly(hourlyForecasts) {
  if (!hourlyForecasts.length) return;

  els.hourlyContent.innerHTML = '';

  const scrollContainer = dom.el('div', { class: 'hourly-scroll' });

  // Today's tab, so: only today's hours (00:00–23:00), not into tomorrow.
  // Past hours (e.g. 5PM when it's 6PM) stay in the DOM and scrollable —
  // we just start the scroll position at the current hour rather than
  // trimming them out.
  const now = new Date();
  const currentHourKey = now.toDateString() + now.getHours();

  const hoursToShow = hourlyForecasts.filter(h => new Date(h.startTime).toDateString() === now.toDateString());

  let currentCard = null;

  hoursToShow.forEach(hour => {
    const startTime = hour.startTime;
    const temp = hour.temperature?.degrees ?? 0;
    const conditionCode = hour.conditionCode || 'UNKNOWN';
    const precipProb = hour.precipitationProbability ?? 0;
    const precipAmt = hour.precipitationAmount?.value ?? 0;
    const windSpeed = hour.wind?.speed?.value ?? 0;
    const hourDate = new Date(startTime);
    const isDay = hourDate.getHours() > 6 && hourDate.getHours() < 20;
    const isCurrent = (hourDate.toDateString() + hourDate.getHours()) === currentHourKey;

    const card = dom.el('div', { class: `hourly-card${isCurrent ? ' current' : ''}` }, [
      dom.el('div', { class: 'hourly-time' }, isCurrent ? 'Now' : dom.formatTime(startTime, { short: true })),
      dom.el('div', { class: 'hourly-icon' }, dom.getWeatherIcon(conditionCode, isDay)),
      dom.el('div', { class: 'hourly-temp' }, dom.formatTemp(temp, state.units)),
      precipProb > 0.1 ? dom.el('div', { class: 'hourly-precip' },
        precipAmt > 0 ? `${Math.round(precipProb * 100)}% · ${dom.formatPrecip(precipAmt, state.units)}` : `${Math.round(precipProb * 100)}%`) : null,
      dom.el('div', { class: 'hourly-wind' }, dom.formatWind(windSpeed, state.units))
    ].filter(Boolean));

    if (isCurrent) currentCard = card;
    scrollContainer.appendChild(card);
  });

  els.hourlyContent.appendChild(scrollContainer);

  // Start the scroll position at "now" — past hours are still in the DOM
  // and reachable by scrolling left, just not shown first.
  if (currentCard) {
    scrollContainer.scrollLeft = currentCard.offsetLeft;
  }
}

function renderDaily(dailyForecasts) {
  if (!dailyForecasts.length) return;

  // Week view = today + 6 days ahead, not whatever the API happens to
  // return (currently 7, requested explicitly below in api.js).
  const days = dailyForecasts.slice(0, 7);

  els.dailyContent.innerHTML = '';

  const list = dom.el('div', { class: 'daily-list' });

  // Week-wide low/high, so each day's range bar is positioned relative
  // to the whole forecast window rather than just its own two numbers.
  const weekMin = Math.min(...days.map(d => d.temperatureMin?.degrees ?? 0));
  const weekMax = Math.max(...days.map(d => d.temperatureMax?.degrees ?? 0));

  days.forEach((day, index) => {
    const date = day.date;
    const tempMax = day.temperatureMax?.degrees ?? 0;
    const tempMin = day.temperatureMin?.degrees ?? 0;
    const conditionCode = day.conditionCode || 'UNKNOWN';
    const precipProb = day.precipitationProbability ?? 0;
    const precipAmt = day.precipitationAmount?.value ?? 0;
    const windMax = day.windSpeedMax?.value ?? 0;

    // Uses the same timezone-safe local-date parser as formatDate() —
    // comparing via `new Date(date)` directly would shift date-only
    // strings by a day in negative-UTC-offset timezones.
    const isToday = dom.parseLocalDate(date).toDateString() === new Date().toDateString();
    const panelId = `daily-detail-${index}`;

    const row = dom.el('div', {
      class: `daily-row ${isToday ? 'today' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      onclick: () => toggleDayDetail(row, panel),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDayDetail(row, panel);
        }
      }
    }, [
      dom.el('div', { class: 'daily-date' }, dom.formatDate(date)),
      dom.el('div', {}, [
        dom.el('div', { class: 'daily-icon' }, dom.getWeatherIcon(conditionCode, true)),
        dom.el('span', { class: 'daily-condition' }, dom.getConditionText(conditionCode))
      ]),
      dom.rangeBar(tempMin, tempMax, weekMin, weekMax, state.units),
      dom.el('div', { class: 'daily-row-meta' }, [
        precipProb > 0.1 ? dom.el('span', { class: 'daily-precip' },
          precipAmt > 0 ? `${Math.round(precipProb * 100)}% · ${dom.formatPrecip(precipAmt, state.units)}` : `${Math.round(precipProb * 100)}%`) : null,
        dom.el('span', { class: 'daily-wind' }, dom.formatWind(windMax, state.units))
      ].filter(Boolean)),
      dom.el('i', { class: 'ti ti-chevron-down daily-chevron', 'aria-hidden': 'true' })
    ]);

    const panel = buildDayDetailPanel(day, panelId);

    list.append(row, panel);
  });

  els.dailyContent.appendChild(list);
}

/**
 * The expanded detail panel for a single day, shown on click. Mirrors the
 * Today card's balanced 6-box icon grid, but with day-appropriate stats:
 * ranges/maxes instead of instantaneous readings, and no pressure/visibility
 * (neither has a coherent single "for the day" value).
 */
function buildDayDetailPanel(day, panelId) {
  const feelsMax = day.feelsLikeMax?.degrees ?? 0;
  const feelsMin = day.feelsLikeMin?.degrees ?? 0;
  const humidityMax = day.humidityMax?.value ?? 0;
  const humidityMin = day.humidityMin?.value ?? 0;
  const windMax = day.windSpeedMax?.value ?? 0;
  const uvMax = day.uvIndexMax?.value ?? 0;
  const precipAmt = day.precipitationAmount?.value ?? 0;
  const sunrise = day.sunriseTime;
  const sunset = day.sunsetTime;

  return dom.el('div', { class: 'daily-detail', id: panelId, hidden: true }, [
    dom.el('div', { class: 'current-details' }, [
      detailItem('feelsLike', 'Feels like', `${dom.formatTemp(feelsMin, state.units)} – ${dom.formatTemp(feelsMax, state.units)}`),
      detailItem('humidity', 'Humidity', `${Math.round(humidityMin)}–${Math.round(humidityMax)}%`),
      detailItem('wind', 'Wind (max)', dom.formatWind(windMax, state.units)),
      detailItem('uv', 'UV Index (max)', `${Math.round(uvMax)} (${day.uvIndexMax?.category || 'N/A'})`),
      detailItem('precipitation', 'Precipitation', dom.formatPrecip(precipAmt, state.units)),
      detailItem('sun', 'Sunrise / Sunset', `${dom.formatTime(sunrise, { short: true })} – ${dom.formatTime(sunset, { short: true })}`)
    ])
  ]);
}

/**
 * Single-open accordion: expanding a day collapses whichever other day was
 * open. Prevents the "open all 7, back to information overload" problem.
 */
function toggleDayDetail(row, panel) {
  const isOpen = !panel.hidden;

  document.querySelectorAll('.daily-row[aria-expanded="true"]').forEach(otherRow => {
    if (otherRow !== row) {
      otherRow.setAttribute('aria-expanded', 'false');
      otherRow.classList.remove('open');
      const otherPanel = document.getElementById(otherRow.getAttribute('aria-controls'));
      if (otherPanel) otherPanel.hidden = true;
    }
  });

  panel.hidden = isOpen;
  row.setAttribute('aria-expanded', String(!isOpen));
  row.classList.toggle('open', !isOpen);
}

function showCachedData() {
  // Could implement cached data display here
  dom.toast('Showing cached data (offline)', 'warning');
}

// ============================================================================
// UI State & Preferences
// ============================================================================

function toggleUnits() {
  state.units = state.units === 'metric' ? 'imperial' : 'metric';
  storage.prefs.setUnits(state.units);
  updateUnitsButton();
  renderAll(); // Re-render with new units
}

function updateUnitsButton() {
  els.unitsToggle.textContent = state.units === 'metric' ? '°C' : '°F';
  els.unitsToggle.setAttribute('aria-label', `Current: ${state.units === 'metric' ? 'Celsius' : 'Fahrenheit'}. Click to switch.`);
}

function toggleTheme() {
  const themes = ['light', 'dark', 'system'];
  const currentIndex = themes.indexOf(state.theme);
  state.theme = themes[(currentIndex + 1) % themes.length];
  storage.prefs.setTheme(state.theme);
  applyTheme(state.theme);
  updateThemeButton();
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

function updateThemeButton() {
  const icons = { light: '☀️', dark: '🌙', system: '💻' };
  els.themeToggle.textContent = icons[state.theme] || '💻';
  els.themeToggle.setAttribute('aria-label', `Theme: ${state.theme}. Click to cycle.`);
}

// ============================================================================
// Error & API Count
// ============================================================================

function showError(message, isWarning = false) {
  els.errorBanner.textContent = message;
  if (isWarning) {
    els.errorBanner.classList.add('warning');
  } else {
    els.errorBanner.classList.remove('warning');
  }
  els.errorBanner.hidden = false;
}

function hideError() {
  els.errorBanner.hidden = true;
  els.errorBanner.classList.remove('warning');
}

function updateApiCount() {
  const count = storage.prefs.getApiCallCount();
  if (els.apiCount) els.apiCount.textContent = `API calls: ${count}`;
}

// ============================================================================
// Start App
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}