/**
 * Storage utilities with TTL support
 * localStorage for persistent, sessionStorage for session-only
 */

const PREFIX = 'weather-dashboard:';

function makeKey(key) {
  return `${PREFIX}${key}`;
}

function setWithTTL(storage, key, value, ttlMs = null) {
  const entry = {
    value,
    timestamp: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : null
  };
  storage.setItem(makeKey(key), JSON.stringify(entry));
}

function getWithTTL(storage, key) {
  const raw = storage.getItem(makeKey(key));
  if (!raw) return null;
  
  try {
    const entry = JSON.parse(raw);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      storage.removeItem(makeKey(key));
      return null;
    }
    return entry.value;
  } catch {
    storage.removeItem(makeKey(key));
    return null;
  }
}

// Persistent storage (localStorage)
export const storage = {
  set(key, value, ttlMs = null) {
    setWithTTL(localStorage, key, value, ttlMs);
  },
  
  get(key) {
    return getWithTTL(localStorage, key);
  },
  
  remove(key) {
    localStorage.removeItem(makeKey(key));
  },
  
  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }
};

// Session storage (cleared on tab close)
export const session = {
  set(key, value, ttlMs = null) {
    setWithTTL(sessionStorage, key, value, ttlMs);
  },
  
  get(key) {
    return getWithTTL(sessionStorage, key);
  },
  
  remove(key) {
    sessionStorage.removeItem(makeKey(key));
  }
};

// Preferences (persistent, no TTL)
export const prefs = {
  // Units: 'metric' | 'imperial'
  getUnits() {
    return storage.get('units') || 'metric';
  },
  
  setUnits(units) {
    storage.set('units', units);
  },
  
  // Theme: 'light' | 'dark' | 'system'
  getTheme() {
    return storage.get('theme') || 'system';
  },
  
  setTheme(theme) {
    storage.set('theme', theme);
  },
  
  // Last known location
  getLastLocation() {
    return storage.get('lastLocation') || null;
  },
  
  setLastLocation(location) {
    storage.set('lastLocation', location);
  },
  
  // API call counter (for monitoring free tier)
  getApiCallCount() {
    return storage.get('apiCallCount') || 0;
  },
  
  incrementApiCallCount() {
    const count = this.getApiCallCount() + 1;
    storage.set('apiCallCount', count);
    return count;
  },
  
  resetApiCallCount() {
    storage.set('apiCallCount', 0);
  },
  
  // API key
  getApiKey() {
    return storage.get('weatherApiKey');
  },
  
  setApiKey(key) {
    storage.set('weatherApiKey', key);
  }
};