# Manual Testing Checklist

No automated test suite exists yet — this is a manual pass checklist. Run through it after any change to `api.js`, `app.js`, or `radar.js`.

## Location
- [ ] First load with geolocation permission granted → correct location detected, weather loads
- [ ] First load with geolocation permission denied → falls back to San Francisco without crashing
- [ ] Reload after a previous session → last location loads from cache instantly (no geolocation prompt)
- [ ] Search a valid place name → location updates, weather + radar reload
- [ ] Search an invalid/nonsense query → toast error shown, no crash
- [ ] Click "re-detect location" button → re-prompts geolocation, updates on success

## Current Conditions
- [ ] All fields populate (temp, feels like, humidity, wind, pressure, visibility, UV)
- [ ] Condition icon and text match the reported condition
- [ ] Timestamp shown and reasonable (not "Invalid Date")
- [ ] Test a Canadian location known to have a nearby ECCC station → confirm current temp differs slightly from pure model output (correction applied) — check console/state for `_source: 'open-meteo+eccc'`
- [ ] Test a non-Canadian location → confirm no ECCC correction attempted (no errors, `_source: 'open-meteo'`)

## Hourly / Daily Forecast
- [ ] Hourly cards scroll horizontally, show next 24–36h
- [ ] Precipitation % only shown when >10%
- [ ] Daily cards show high/low, correct "Today"/"Tomorrow" labels
- [ ] Sunrise/sunset times look correct for the season/location

## Radar
- [ ] Map renders visibly (not blank/grey) on first load — **check after a hard refresh**, not just cached load
- [ ] Base map (streets) visible
- [ ] Radar overlay visible when there's actual precipitation nearby (test a location with active rain)
- [ ] Play button animates through frames with a visible crossfade, not a hard cut or a blank flash
- [ ] Pause button stops animation
- [ ] Prev/next step one frame at a time and pause any running animation
- [ ] Timestamp label updates per frame; nowcast frames labeled "(forecast)"
- [ ] Map recenters when location changes (search or re-detect)
- [ ] Refresh button reloads radar frames (check timestamp advances)
- [ ] Resize the browser window → map doesn't go blank/misaligned

## Preferences
- [ ] Units toggle switches °C/°F and re-renders all sections without a refetch
- [ ] Units preference persists across reload
- [ ] Theme toggle cycles light → dark → system correctly
- [ ] Theme preference persists across reload
- [ ] "system" theme respects OS dark-mode changes live (toggle OS setting while app is open)

## Resilience / Offline
- [ ] Load once successfully, then go offline (dev tools → Network → Offline), click refresh → shows cached data + "offline" notice with timestamp
- [ ] Load fresh with no prior cache while offline → shows a clear error, no crash
- [ ] Throttle network to "slow 3G" → skeleton loaders appear during fetch, no layout jump when data arrives

## Cross-cutting
- [ ] No errors in console on a clean run
- [ ] No errors/warnings specifically from Leaflet or the radar module
- [ ] Keyboard: tab through all controls, confirm focus states visible and all buttons reachable
- [ ] Mobile viewport (or real device): layout doesn't overflow, radar map is usable via touch (pinch/pan)
- [ ] Test in Chrome, Firefox, Safari at minimum

## Regression Watch List
(Bugs that have happened before — re-check these specifically after changes)
- [ ] ECCC pressure value is used as-is in hPa, with NO kPa conversion — SWOB's own docs specify stn_pres uom="hPa". An earlier version of this code wrongly assumed kPa and multiplied by 10, inflating readings 10x (e.g. 972 hPa shown as 9721 hPa). Don't reintroduce that multiplication.
- [ ] Radar map isn't blank after a **hard refresh** specifically (stale-CSS/sizing issue has bitten before)
- [ ] Radar frame crossfade doesn't end in a blank/invisible layer (Leaflet opacity override bug — must use `setOpacity()`, not raw `style.opacity`)