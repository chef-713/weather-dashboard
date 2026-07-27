/**
 * Weather Data Client — Open-Meteo + ECCC + RainViewer
 *
 * Replaces the Google Maps Weather API client. Keeps the exact same
 * public interface (getAllWeather, getCurrentConditions, getHourlyForecast,
 * getDailyForecast) and the exact same normalized output shape, so
 * app.js and dom.js require ZERO changes.
 *
 * Data flow:
 *  1. Open-Meteo  -> primary source for current + hourly + daily (free, no key)
 *  2. ECCC SWOB   -> best-effort correction of "current conditions" using the
 *                    nearest real station observation (free, no key)
 *  3. RainViewer  -> radar tile metadata for a near-term precip overlay
 *                    (free, no key). NOTE: this client does not attempt to
 *                    numerically override the precipitation probability from
 *                    radar pixels — reading tile pixel colors client-side
 *                    hits CORS/canvas restrictions and isn't reliable. What
 *                    it *does* give you is the radar frame URLs, ready to
 *                    drop into a Leaflet/Mapbox layer for a visual overlay.
 *                    Precipitation numbers still come from Open-Meteo.
 */

import * as storage from './storage.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const ECCC_SWOB_URL = 'https://api.weather.gc.ca/collections/swob-realtime/items';
const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

// ---------------------------------------------------------------------------
// WMO weather code -> condition strings already understood by dom.js
// (https://open-meteo.com/en/docs -> "WMO Weather interpretation codes")
// ---------------------------------------------------------------------------
const WMO_CODE_MAP = {
  0: 'CLEAR',
  1: 'MOSTLY_CLEAR',
  2: 'PARTLY_CLOUDY',
  3: 'OVERCAST',
  45: 'FOG',
  48: 'FOG',
  51: 'DRIZZLE',
  53: 'DRIZZLE',
  55: 'DRIZZLE',
  56: 'FREEZING_DRIZZLE',
  57: 'FREEZING_DRIZZLE',
  61: 'LIGHT_RAIN',
  63: 'RAIN',
  65: 'HEAVY_RAIN',
  66: 'FREEZING_RAIN',
  67: 'FREEZING_RAIN',
  71: 'LIGHT_SNOW',
  73: 'SNOW',
  75: 'HEAVY_SNOW',
  77: 'SNOW',
  80: 'RAIN_SHOWERS',
  81: 'RAIN_SHOWERS',
  82: 'HEAVY_RAIN',
  85: 'SNOW_SHOWERS',
  86: 'SNOW_SHOWERS',
  95: 'THUNDERSTORM',
  96: 'THUNDERSTORM_WITH_RAIN',
  99: 'SEVERE_THUNDERSTORM'
};

function mapConditionCode(wmoCode, isDay = true) {
  const code = WMO_CODE_MAP[wmoCode] || 'UNKNOWN';
  // dom.js has separate SUNNY vs CLEAR icons for day/night on code 0
  if (code === 'CLEAR' && isDay) return 'SUNNY';
  return code;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class WeatherAPI {
  constructor() {
    // No API key needed for any of the three sources on this tier.
    this.callCount = 0;
  }

  async _fetchJson(url, { timeoutMs = 8000 } = {}) {
    this.callCount++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      try {
        storage.prefs.incrementApiCallCount();
      } catch (e) {
        console.warn('Failed to increment API call count:', e);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------
  // Open-Meteo — primary source
  // -------------------------------------------------------------------
  async _fetchOpenMeteo(lat, lon) {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('wind_speed_unit', 'ms');
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation'
    );
    url.searchParams.set(
      'hourly',
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,visibility,uv_index'
    );
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,relative_humidity_2m_max,relative_humidity_2m_min,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset'
    );
    url.searchParams.set('forecast_days', '7');

    return this._fetchJson(url.toString());
  }

  _normalizeCurrentFromOpenMeteo(raw) {
    const c = raw.current || {};
    const isDay = !!c.is_day;

    // Pull visibility & UV index from the hourly array at the timestamp
    // closest to "now", since Open-Meteo's `current` block doesn't include them.
    let visibilityM = 10000;
    let uvValue = 0;
    if (raw.hourly?.time?.length) {
      const nowMs = new Date(c.time || Date.now()).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      raw.hourly.time.forEach((t, i) => {
        const diff = Math.abs(new Date(t).getTime() - nowMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      });
      visibilityM = raw.hourly.visibility?.[bestIdx] ?? visibilityM;
      uvValue = raw.hourly.uv_index?.[bestIdx] ?? uvValue;
    }

    return {
      name: 'current',
      temperature: { degrees: c.temperature_2m ?? 0, unit: 'CELSIUS' },
      feelsLikeTemperature: { degrees: c.apparent_temperature ?? c.temperature_2m ?? 0, unit: 'CELSIUS' },
      humidity: c.relative_humidity_2m ?? 0,
      wind: {
        speed: { value: c.wind_speed_10m ?? 0, unit: 'METERS_PER_SECOND' },
        direction: { degrees: c.wind_direction_10m ?? 0 }
      },
      pressure: { value: c.surface_pressure ?? 1013, unit: 'HECTOPASCALS' },
      visibility: { value: visibilityM, unit: 'METERS' },
      uvIndex: { value: uvValue, category: uvCategory(uvValue) },
      // Precipitation over the preceding hour (Open-Meteo's `current` block
      // already requests this field, it just wasn't being surfaced before).
      precipitation: { value: c.precipitation ?? 0, unit: 'MILLIMETERS' },
      conditionCode: mapConditionCode(c.weather_code, isDay),
      isDaytime: isDay,
      observationTime: c.time || new Date().toISOString(),
      _source: 'open-meteo'
    };
  }

  _normalizeHourlyFromOpenMeteo(raw) {
    const h = raw.hourly || {};
    const times = h.time || [];

    const hourlyForecasts = times.map((t, i) => {
      const hourDate = new Date(t);
      const isDay = hourDate.getHours() > 6 && hourDate.getHours() < 20;
      return {
        startTime: t,
        endTime: t,
        temperature: { degrees: h.temperature_2m?.[i] ?? 0, unit: 'CELSIUS' },
        feelsLikeTemperature: { degrees: h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? 0, unit: 'CELSIUS' },
        humidity: h.relative_humidity_2m?.[i] ?? 0,
        wind: {
          speed: { value: h.wind_speed_10m?.[i] ?? 0, unit: 'METERS_PER_SECOND' },
          direction: { degrees: h.wind_direction_10m?.[i] ?? 0 }
        },
        conditionCode: mapConditionCode(h.weather_code?.[i], isDay),
        precipitationProbability: (h.precipitation_probability?.[i] ?? 0) / 100,
        precipitationAmount: { value: h.precipitation?.[i] ?? 0, unit: 'MILLIMETERS' }
      };
    });

    return { hourlyForecasts };
  }

  _normalizeDailyFromOpenMeteo(raw) {
    const d = raw.daily || {};
    const dates = d.time || [];

    const dailyForecasts = dates.map((date, i) => {
      const uvMax = d.uv_index_max?.[i] ?? 0;
      return {
        date,
        temperatureMax: { degrees: d.temperature_2m_max?.[i] ?? 0, unit: 'CELSIUS' },
        temperatureMin: { degrees: d.temperature_2m_min?.[i] ?? 0, unit: 'CELSIUS' },
        feelsLikeMax: { degrees: d.apparent_temperature_max?.[i] ?? d.temperature_2m_max?.[i] ?? 0, unit: 'CELSIUS' },
        feelsLikeMin: { degrees: d.apparent_temperature_min?.[i] ?? d.temperature_2m_min?.[i] ?? 0, unit: 'CELSIUS' },
        humidityMax: { value: d.relative_humidity_2m_max?.[i] ?? 0 },
        humidityMin: { value: d.relative_humidity_2m_min?.[i] ?? 0 },
        uvIndexMax: { value: uvMax, category: uvCategory(uvMax) },
        windSpeedMax: { value: d.wind_speed_10m_max?.[i] ?? 0, unit: 'METERS_PER_SECOND' },
        conditionCode: mapConditionCode(d.weather_code?.[i], true),
        precipitationProbability: (d.precipitation_probability_max?.[i] ?? 0) / 100,
        precipitationAmount: { value: d.precipitation_sum?.[i] ?? 0, unit: 'MILLIMETERS' },
        sunriseTime: d.sunrise?.[i] || new Date().toISOString(),
        sunsetTime: d.sunset?.[i] || new Date().toISOString()
      };
    });

    return { dailyForecasts };
  }

  // -------------------------------------------------------------------
  // ECCC SWOB — best-effort "current conditions" correction
  // -------------------------------------------------------------------
  async _fetchNearestEcccObservation(lat, lon) {
    // ~0.5 degree bbox (~50km) around the point; widen if nothing found.
    const buffer = 0.5;
    const bbox = [lon - buffer, lat - buffer, lon + buffer, lat + buffer].join(',');
    const url = new URL(ECCC_SWOB_URL);
    url.searchParams.set('bbox', bbox);
    url.searchParams.set('sortby', '-date_tm-value');
    url.searchParams.set('limit', '50');
    url.searchParams.set('f', 'json');

    const raw = await this._fetchJson(url.toString(), { timeoutMs: 6000 });
    const features = raw.features || [];
    if (!features.length) return null;

    // Pick the closest station among the most recent observations returned.
    let best = null;
    let bestDist = Infinity;
    for (const f of features) {
      const [flon, flat] = f.geometry?.coordinates || [];
      if (flon == null || flat == null) continue;
      const dist = haversineKm(lat, lon, flat, flon);
      if (dist < bestDist) {
        bestDist = dist;
        best = f;
      }
    }
    if (!best) return null;

    const p = best.properties || {};
    return {
      stationName: p['stn_nam'] || p['station_name'] || 'ECCC station',
      distanceKm: bestDist,
      observedAt: p['date_tm-value'] || p['date_tm'],
      temperature: p['air_temp-value'] ?? p['air_temp'],
      humidity: p['rel_hum-value'] ?? p['rel_hum'],
      pressure: p['stn_pres-value'] ?? p['stn_pres'],
      windSpeedMs: (p['avg_wnd_spd-value'] ?? p['avg_wnd_spd']) != null
        ? (p['avg_wnd_spd-value'] ?? p['avg_wnd_spd']) // SWOB reports km/h in some feeds; treat cautiously
        : undefined
    };
  }

  /**
   * Blend a fresh ECCC observation into the Open-Meteo "current" block.
   * Only overwrites fields ECCC actually reported, and only if the
   * observation is recent (within 90 minutes) and reasonably close (<75km).
   * Any failure here is silently ignored — Open-Meteo's value stands.
   */
  async _applyEcccCorrection(current, lat, lon) {
    try {
      const obs = await this._fetchNearestEcccObservation(lat, lon);
      if (!obs) return current;

      const ageMs = obs.observedAt ? Date.now() - new Date(obs.observedAt).getTime() : Infinity;
      const tooOld = ageMs > 90 * 60 * 1000;
      const tooFar = obs.distanceKm > 75;
      if (tooOld || tooFar) return current;

      const corrected = { ...current, _source: 'open-meteo+eccc', _ecccStation: obs.stationName };
      if (typeof obs.temperature === 'number') {
        corrected.temperature = { degrees: obs.temperature, unit: 'CELSIUS' };
      }
      if (typeof obs.humidity === 'number') {
        corrected.humidity = obs.humidity;
      }
      if (typeof obs.pressure === 'number') {
        // ECCC SWOB reports station pressure (stn_pres) in kPa, not hPa.
        // 1 kPa = 10 hPa — convert before assigning.
        corrected.pressure = { value: obs.pressure * 10, unit: 'HECTOPASCALS' };
      }
      return corrected;
    } catch (err) {
      console.warn('ECCC correction skipped (non-fatal):', err.message);
      return current;
    }
  }

  // -------------------------------------------------------------------
  // RainViewer — radar frame metadata, for an optional map overlay
  // -------------------------------------------------------------------
  async getRadarFrames() {
    try {
      const raw = await this._fetchJson(RAINVIEWER_URL, { timeoutMs: 6000 });
      const host = raw.host;
      const past = raw.radar?.past || [];
      const nowcast = raw.radar?.nowcast || [];
      const tileUrl = (frame) => `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      return {
        past: past.map(f => ({ time: f.time, url: tileUrl(f) })),
        nowcast: nowcast.map(f => ({ time: f.time, url: tileUrl(f) }))
      };
    } catch (err) {
      console.warn('RainViewer fetch failed (non-fatal):', err.message);
      return { past: [], nowcast: [] };
    }
  }

  // -------------------------------------------------------------------
  // Public API — unchanged signatures
  // -------------------------------------------------------------------
  async getCurrentConditions(lat, lon) {
    const cacheKey = `current:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = storage.session.get(cacheKey);
    if (cached) return cached;

    const raw = await this._fetchOpenMeteo(lat, lon);
    let current = this._normalizeCurrentFromOpenMeteo(raw);
    current = await this._applyEcccCorrection(current, lat, lon);

    storage.session.set(cacheKey, current, 10 * 60 * 1000); // 10m TTL
    return current;
  }

  async getHourlyForecast(lat, lon /*, hours */) {
    const cacheKey = `hourly:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = storage.session.get(cacheKey);
    if (cached) return cached;

    const raw = await this._fetchOpenMeteo(lat, lon);
    const normalized = this._normalizeHourlyFromOpenMeteo(raw);
    storage.session.set(cacheKey, normalized, 30 * 60 * 1000); // 30m TTL
    return normalized;
  }

  async getDailyForecast(lat, lon /*, days */) {
    const cacheKey = `daily:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = storage.session.get(cacheKey);
    if (cached) return cached;

    const raw = await this._fetchOpenMeteo(lat, lon);
    const normalized = this._normalizeDailyFromOpenMeteo(raw);
    storage.session.set(cacheKey, normalized, 60 * 60 * 1000); // 1h TTL
    return normalized;
  }

  /**
   * Single call replaces the old 3-request pattern: Open-Meteo returns
   * current+hourly+daily together, so we fetch it once and derive all
   * three normalized blocks from the same payload (then layer the ECCC
   * correction on top of "current" only).
   */
  async getAllWeather(lat, lon) {
    const cacheKey = `all:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = storage.session.get(cacheKey);
    if (cached) return cached;

    const raw = await this._fetchOpenMeteo(lat, lon);

    let current = this._normalizeCurrentFromOpenMeteo(raw);
    current = await this._applyEcccCorrection(current, lat, lon);

    const hourly = this._normalizeHourlyFromOpenMeteo(raw);
    const daily = this._normalizeDailyFromOpenMeteo(raw);

    const result = { current, hourly, daily };
    storage.session.set(cacheKey, result, 10 * 60 * 1000);

    // Also populate the individual sub-caches so any future code that calls
    // getCurrentConditions/getHourlyForecast/getDailyForecast directly for
    // these same coordinates hits cache instead of re-fetching.
    const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    storage.session.set(`current:${coordKey}`, current, 10 * 60 * 1000);
    storage.session.set(`hourly:${coordKey}`, hourly, 30 * 60 * 1000);
    storage.session.set(`daily:${coordKey}`, daily, 60 * 60 * 1000);

    return result;
  }

  getCallCount() {
    return this.callCount;
  }
}

function uvCategory(uv) {
  if (uv >= 11) return 'Extreme';
  if (uv >= 8) return 'Very High';
  if (uv >= 6) return 'High';
  if (uv >= 3) return 'Moderate';
  return 'Low';
}

export default WeatherAPI;
export { WeatherAPI };