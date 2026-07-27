# Weather Dashboard — Detailed Plan & Requirements

## 1. Project Overview
Build a **single-page, client-side weather dashboard** using the **Google Maps Platform Weather API (Weather API)**.  
- Free tier: 10,000 calls/month (current + 240h hourly + 10-day daily)  
- Zero backend, zero build step — runs by double-clicking `index.html`  
- Target: modern browsers (Chrome/FF/Safari/Edge, last 2 versions)

---

## 2. Functional Requirements

### 2.1 Location Handling
| Feature | Detail |
|---------|--------|
| **Primary** | Browser Geolocation API (one-time prompt, cached in `localStorage`) |
| **Fallback** | Manual search: text input → Google Places Autocomplete (or simple text + geocode via Weather API's `location` param) |
| **Persistence** | Last successful location saved in `localStorage`; auto-load on return |
| **Multi-location (v2)** | Not in V1 — single active location only |

### 2.2 Data Displayed (all from Weather API)
| Section | Fields | Source Endpoint |
|---------|--------|-----------------|
| **Current Conditions** | temp, feels_like, humidity, wind_speed/dir, pressure, visibility, UV index, condition text/icon, sunrise/sunset, last_updated | `current` |
| **Hourly Forecast (24h)** | time, temp, condition, precip_prob, wind, feels_like | `forecast.hourly` (first 24 entries) |
| **Daily Forecast (10d)** | date, high/low, condition, precip_prob, wind, UV max, sunrise/sunset | `forecast.daily` (all 10) |

### 2.3 UI/UX Requirements
- **Single page, no routing** — three vertical sections (Current, Hourly, Daily)
- **Responsive**: mobile-first, stacks vertically; ≥768px shows hourly as horizontal scroll, daily as grid
- **Units toggle**: °C/°F, km/h ↔ mph, mm ↔ in (persisted in `localStorage`)
- **Theme**: light/dark/system (CSS custom properties, persisted)
- **Loading states**: skeleton cards while fetching; inline error toast on failure
- **Offline banner**: show cached data timestamp if fetch fails & cache exists
- **Accessibility**: semantic HTML, ARIA labels, keyboard-navigable, color-contrast AA

### 2.4 API Usage
| Item | Spec |
|------|------|
| **Endpoint** | `https://weather.googleapis.com/v1/{current|forecast/hourly|forecast/daily}:lookup?key=API_KEY&location.latitude=X&location.longitude=Y&units=METRIC|IMPERIAL` |
| **Calls per load** | 3 (current, hourly, daily) — can batch via `forecast:lookup` with `hours=24&days=10` (single call returns all) |
| **Caching** | `sessionStorage` for 10 min (current), 30 min (hourly), 1 hr (daily) — reduces repeat calls on refresh |
| **Rate limit guard** | Track calls in `localStorage` (rolling 24h); warn at 9,000/month |

---

## 3. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | First paint < 1.5s on 3G; JS < 30 KB gzipped (vanilla) |
| **Security** | API key restricted to HTTP referrers (localhost + prod domain); no key in repo — injected at load via `config.js` (gitignored) |
| **Privacy** | No analytics, no external fonts/CDNs (self-hosted Inter/IBM Plex), no cookies beyond `localStorage` |
| **Maintainability** | Single `index.html` + `app.js` + `styles.css` + `config.js.example`; ESLint + Prettier config included |
| **Browser support** | ES2022, fetch, CSS Grid, custom properties — no transpilation needed |

---

## 4. Technical Architecture

```
index.html          # semantic markup, links CSS/JS, inline config.js check
config.js           # gitignored — exports const API_KEY, DEFAULT_UNITS, etc.
styles.css          # CSS custom props, mobile-first, dark mode via [data-theme]
app.js              # ES module (type=module) — init, geolocation, fetch, render, units, theme
utils/
  api.js            # fetch wrapper with caching, retry, error normalization
  dom.js            # tiny helpers: createEl, formatTime, formatTemp, etc.
  storage.js        # localStorage/sessionStorage wrappers with TTL
```

### Data Flow
```
load → check config.js exists → geolocation (or saved) → 
  fetch weather (with sessionStorage cache) → 
  render three sections → 
  bind UI events (unit toggle, theme, location search)
```

---

## 5. API Key Management (Security)
- **Never commit `config.js`** — provide `config.js.example` with placeholder
- **Runtime injection**: `config.js` exports `window.WEATHER_API_KEY`
- **Referrer restrictions** in GCP Console:
  - `http://localhost/*`
  - `http://127.0.0.1/*`
  - `https://yourdomain.com/*`
- **API restriction**: Weather API only

---

## 6. File Structure (Final)
```
weather-dashboard/
├── index.html
├── config.js.example
├── styles.css
├── app.js
├── utils/
│   ├── api.js
│   ├── dom.js
│   └── storage.js
├── .gitignore
├── eslint.config.js
├── prettier.config.js
└── README.md
```

---

## 7. Acceptance Criteria (V1 Done When…)
- [ ] Open `index.html` → asks for location → shows current/hourly/daily
- [ ] Unit toggle (°C/°F) persists across reloads
- [ ] Dark/light/system theme persists
- [ ] Manual location search works (text input + Enter)
- [ ] Cached data shown offline with timestamp banner
- [ ] API key restricted in GCP; `config.js` gitignored
- [ ] Zero console errors on clean load
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90

---

## 8. Future Enhancements (Post-V1)
- Saved locations / favorites sidebar
- Weather alerts / severe weather banner
- Historical comparison (yesterday vs today)
- PWA: installable, offline-first with Service Worker
- Charts (temp/precip trends) via lightweight canvas lib
- Shareable link (`?lat=X&lon=Y&units=metric`)

---

## 9. Next Steps
1. **User provides API key** → I create `config.js` locally (not committed)
2. I scaffold the file structure above
3. Implement `utils/*` → `app.js` → `styles.css` → `index.html`
4. Smoke test in browser; hand off for review

---

*Ready when you are — paste the API key and I'll start scaffolding.*