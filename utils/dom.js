/**
 * DOM utilities, formatting, and UI helpers
 */

// Simple element creator
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  // Attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') element.className = value;
    else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([k, v]) => element.dataset[k] = v);
    } else {
      element.setAttribute(key, value);
    }
  });

  // Normalize children to array
  const childArray = Array.isArray(children) ? children : [children];

  // Children
  childArray.filter(Boolean).forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });

  return element;
}

// Format temperature
export function formatTemp(celsius, units = 'metric') {
  if (units === 'imperial') {
    return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

// Icons for the current-conditions detail stats (distinct from weather
// condition icons above — these label a measurement, not a sky condition).
// Uses the Tabler Icons webfont (loaded via CDN in index.html) rather than
// emoji, matching the icon set from the earlier mockup.
const DETAIL_ICON_CLASSES = {
  feelsLike: 'temperature',
  humidity: 'droplet',
  wind: 'wind',
  pressure: 'gauge',
  visibility: 'eye',
  precipitation: 'cloud-rain',
  uv: 'sun-high',
  sun: 'sunrise'
};

export function detailIcon(key) {
  return el('i', { class: `ti ti-${DETAIL_ICON_CLASSES[key] || 'help'}`, 'aria-hidden': 'true' });
}

// Temperature color-coding class (celsius-based thresholds, unit-independent)
export function tempColorClass(celsius) {
  if (celsius <= -10) return 'temp-frigid';
  if (celsius <= 0) return 'temp-cold';
  if (celsius <= 10) return 'temp-cool';
  if (celsius <= 20) return 'temp-mild';
  if (celsius <= 28) return 'temp-warm';
  return 'temp-hot';
}

// Format wind speed
export function formatWind(ms, units = 'metric') {
  if (units === 'imperial') {
    const mph = ms * 2.237;
    return `${Math.round(mph)} mph`;
  }
  const kmh = ms * 3.6;
  return `${Math.round(kmh)} km/h`;
}

// Format precipitation
export function formatPrecip(mm, units = 'metric') {
  if (units === 'imperial') {
    const inches = mm / 25.4;
    return `${inches.toFixed(2)} in`;
  }
  return `${mm.toFixed(1)} mm`;
}

// Format visibility
export function formatVisibility(meters, units = 'metric') {
  if (units === 'imperial') {
    const miles = (meters / 1000) * 0.621371;
    return `${Math.round(miles)} mi`;
  }
  return `${Math.round(meters / 1000)} km`;
}

// Format pressure
export function formatPressure(hpa, units = 'metric') {
  if (units === 'imperial') {
    const inhg = hpa * 0.02953;
    return `${inhg.toFixed(2)} inHg`;
  }
  return `${Math.round(hpa)} hPa`;
}

// Format time
export function formatTime(isoString, { short = false } = {}) {
  const date = new Date(isoString);
  if (short) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Parse a date-only string ("YYYY-MM-DD") as a LOCAL calendar date, not UTC.
 * `new Date("2026-07-24")` parses as UTC midnight, which rolls back to the
 * previous day in any negative-UTC-offset timezone once converted to local
 * time — that's what was causing "Today" to be mislabeled. Open-Meteo's
 * daily `date` field is already the correct local calendar day (from the
 * `timezone=auto` request param), so it just needs to be parsed as local,
 * not reinterpreted through UTC.
 */
export function parseLocalDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(dateStr);
}

// Format date
export function formatDate(isoString) {
  const date = parseLocalDate(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// Weather condition icons (using Unicode/emoji)
export function getWeatherIcon(conditionCode, isDay = true) {
  // Google Weather API condition codes mapping
  // https://developers.google.com/maps/documentation/weather/reference/rest/v1/forecast.lookup#ConditionCode
  const icons = {
    // Clear
    'SUNNY': isDay ? '☀️' : '🌙',
    'CLEAR': isDay ? '☀️' : '🌙',
    'MOSTLY_SUNNY': isDay ? '🌤️' : '🌙',
    'MOSTLY_CLEAR': isDay ? '🌤️' : '🌙',
    'PARTLY_CLOUDY': isDay ? '⛅' : '☁️',
    'PARTLY_SUNNY': isDay ? '⛅' : '☁️',

    // Cloudy
    'CLOUDY': '☁️',
    'MOSTLY_CLOUDY': '☁️',
    'OVERCAST': '☁️',
    'SCATTERED_CLOUDS': isDay ? '🌤️' : '☁️',
    'BROKEN_CLOUDS': '☁️',

    // Rain
    'LIGHT_RAIN': '🌦️',
    'RAIN': '🌧️',
    'HEAVY_RAIN': '🌧️',
    'RAIN_SHOWERS': '🌦️',
    'DRIZZLE': '🌦️',
    'FREEZING_DRIZZLE': '🌧️',
    'FREEZING_RAIN': '🌧️',

    // Thunderstorm
    'THUNDERSTORM': '⛈️',
    'SEVERE_THUNDERSTORM': '⛈️',
    'THUNDERSTORM_WITH_LIGHT_RAIN': '⛈️',
    'THUNDERSTORM_WITH_RAIN': '⛈️',
    'THUNDERSTORM_WITH_HEAVY_RAIN': '⛈️',

    // Snow
    'LIGHT_SNOW': '🌨️',
    'SNOW': '🌨️',
    'HEAVY_SNOW': '🌨️',
    'SNOW_SHOWERS': '🌨️',
    'BLIZZARD': '🌨️',
    'SLEET': '🌨️',
    'ICE_PELLETS': '🌨️',
    'HAIL': '🌨️',

    // Fog/Mist
    'FOG': '🌫️',
    'MIST': '🌫️',
    'HAZE': '🌫️',
    'SMOKE': '🌫️',

    // Wind
    'WINDY': '💨',
    'VERY_WINDY': '💨',

    // Other
    'DUST': '🌪️',
    'SAND': '🌪️',
    'VOLCANIC_ASH': '🌋',
    'SQUALLS': '🌪️',
    'TORNADO': '🌪️',
    'TROPICAL_STORM': '🌀',
    'HURRICANE': '🌀',

    // Unknown
    'UNKNOWN': '❓'
  };

  return icons[conditionCode] || icons['UNKNOWN'];
}

export function getConditionText(conditionCode) {
  return conditionCode
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Build a horizontal min/max range bar for a single day, positioned
 * relative to the week's overall low/high. Used in the daily forecast
 * row-list to make warming/cooling trends visible at a glance.
 *
 * @param {number} dayMin - this day's low (celsius)
 * @param {number} dayMax - this day's high (celsius)
 * @param {number} weekMin - lowest low across the whole forecast window
 * @param {number} weekMax - highest high across the whole forecast window
 * @param {string} units - 'metric' | 'imperial', for the two end labels
 */
export function rangeBar(dayMin, dayMax, weekMin, weekMax, units = 'metric') {
  const span = Math.max(weekMax - weekMin, 1); // avoid divide-by-zero on flat weeks
  const leftPct = ((dayMin - weekMin) / span) * 100;
  const widthPct = Math.max(((dayMax - dayMin) / span) * 100, 6);
  const rightPct = leftPct + widthPct;

  return el('div', { class: 'range-bar', role: 'img', 'aria-label': `Range ${formatTemp(dayMin, units)} to ${formatTemp(dayMax, units)}` }, [
    el('div', { class: 'range-bar-track' }, [
      el('div', {
        class: `range-bar-fill ${tempColorClass((dayMin + dayMax) / 2)}`,
        style: { left: `${leftPct}%`, width: `${widthPct}%` }
      }),
      // Low label grows rightward FROM the fill's left edge, high label
      // grows leftward FROM its right edge — both anchored exactly at the
      // fill's true edge with no inward clamp needed, since text always
      // extends inward (toward center) rather than outward past the track.
      el('span', { class: 'range-bar-low', style: { left: `${leftPct}%` } }, formatTemp(dayMin, units)),
      el('span', { class: 'range-bar-high', style: { left: `${rightPct}%` } }, formatTemp(dayMax, units))
    ])
  ]);
}

// Skeleton loaders
export function skeleton(type) {
  const skel = el('div', { class: `skeleton ${type}` });

  if (type === 'current-skeleton') {
    skel.append(
      el('div', { class: 'skel-icon' }),
      el('div', { class: 'skel-temp' }),
      el('div', { class: 'skel-text' }),
      el('div', { class: 'skel-text short' })
    );
  } else if (type === 'hourly-skeleton') {
    skel.append(
      el('div', { class: 'skel-time' }),
      el('div', { class: 'skel-icon' }),
      el('div', { class: 'skel-temp' }),
      el('div', { class: 'skel-text' })
    );
  } else if (type === 'daily-skeleton') {
    skel.append(
      el('div', { class: 'skel-date' }),
      el('div', { class: 'skel-icon' }),
      el('div', { class: 'skel-text' }),
      el('div', { class: 'skel-temps' }),
      el('div', { class: 'skel-details' })
    );
  }

  return skel;
}

// Toast notifications
const toastContainer = (() => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = el('div', { id: 'toast-container', class: 'toast-container' });
    document.body.appendChild(container);
  }
  return container;
})();

export function toast(message, type = 'info', duration = 4000) {
  const t = el('div', { class: `toast toast-${type}` }, message);
  toastContainer.appendChild(t);

  // Animate in
  requestAnimationFrame(() => t.classList.add('show'));

  // Remove after duration
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// Debounce helper
export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle helper
export function throttle(fn, delay = 300) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}