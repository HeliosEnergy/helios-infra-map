# EPIC: Data Security & Access Control

## Objective
Prevent unauthorized extraction of proprietary datasets (power plants, fiber cables, HIFLD transmission lines, global infrastructure data). A determined user should not be able to reconstruct the full dataset by scraping API endpoints, inspecting the browser bundle, or accessing S3 directly.

## Threat Model
| Threat | Current Exposure | Risk Level |
|---|---|---|
| Direct download of `public/data/*` files via URL | All CSVs and JSON files (30MB+) are statically served with zero auth | **CRITICAL** |
| S3 bucket URL visible in client JS bundle | `helios-dataanalysisbucket.s3.us-east-1.amazonaws.com` hardcoded in `unifiedPowerPlantProcessor.ts` and `efficientDataLoader.ts` | **CRITICAL** |
| API endpoints return full datasets, no auth | `/api/power-plants` returns all records; `/api/fiber-bbox` returns 25k features; `/api/hifld-s3` returns full HIFLD dump | **CRITICAL** |
| CORS is `Access-Control-Allow-Origin: *` on all endpoints | Any origin can call any API | **HIGH** |
| PasswordGate is client-side only (`PasswordGate.tsx`) | Bypassed by calling APIs directly or flipping `localStorage` | **HIGH** |
| Mapbox token in client bundle | `VITE_MAPBOX_TOKEN=pk.eyJ1...` baked into JS via Vite env prefix | **MEDIUM** |
| Client-side caching stores full datasets | IndexedDB and localStorage contain full HIFLD/cable/plant arrays extractable via DevTools | **MEDIUM** |

---

## Features That MUST Be Preserved
Every change must be validated against this list. If any feature breaks, the change is rejected.

1. **Power Plant Visualization** - ScatterplotLayer rendering all filtered plants with color-by-source, size-by-capacity/generation/capacity-factor, sqrt-scale normalization
2. **Multi-Source Filtering** - Filter by energy source type (solar, wind, gas, etc.) via `filteredSources` Set
3. **Country Filtering** - Toggle visibility per country (CA, US, KZ, AE, IN, KG, and all global DB countries) via `enabledCountries`
4. **Power Range Slider** - `minPowerOutput` / `maxPowerOutput` filtering
5. **Capacity Factor Slider** - `minCapacityFactor` / `maxCapacityFactor` filtering with debounce
6. **Proximity Analysis** - "Show only nearby plants" mode using RBush spatial index against submarine cables with configurable distance (haversine + point-to-segment math)
7. **WFS Submarine Cables** - PathLayer rendering ITU cables in orange, pickable with hover
8. **Fiber Cables** - PathLayer rendering at zoom >= 4, viewport-based loading via bbox, magenta color, hover tooltips with persistent mode
9. **HIFLD Transmission Lines** - PathLayer with voltage-class-based coloring/width, progressive loading with progress bar, hover tooltips with delayed hide
10. **Address Search** - Geocoding with location pin, radius circle overlay, auto-zoom to fit circle
11. **Location Stats Panel** - Shows plants within radius of a selected location
12. **Proximity Dialog** - Lists nearby plants to cables with distances
13. **Plant Hover Tooltips** - Show plant details on hover
14. **HIFLD Line Hover Tooltips** - Show line properties (voltage, owner, etc.)
15. **Fiber Cable Hover Tooltips** - Persistent tooltip mode on click
16. **Progressive HIFLD Loading** - Progress bar with percentage, line count, and loading message
17. **Nearby Fiber Cables** - Calculate nearby fiber to a selected plant
18. **Dark/Light Theme** - ThemeContext toggling
19. **Data Warning** - Shows warning if < 500 plants loaded
20. **SizeBy Options** - Switch between nameplate_capacity, capacity_factor, generation for dot sizing

---

## Implementation Stories

### S1: Move Raw Data Behind Authenticated API Routes

**Problem**: Everything in `public/data/` is served statically. Files: `eia_aggregated_plant_capacity.json` (16MB), `global_power_plant_database.csv` (11MB), `Power_Plants,_100_MW_or_more.csv`, `Renewable_Energy_Power_Plants,_1_MW_or_more.csv`, `Kazakhstan_Power_Plants.csv`.

**What to do**:
- Move all data files from `public/data/` to a non-public directory (e.g., `data/` at project root, outside `public/` and `src/`).
- These files should only be accessible through API routes, never served directly to browsers.
- Update `unifiedPowerPlantProcessor.ts` — all `fetch('/data/...')` calls must be replaced with calls to authenticated API endpoints.
- The existing fallback chain (S3 → local file) in `unifiedPowerPlantProcessor.ts` must still work, but the local file reads should happen server-side only (in the API handler), not client-side.

**What NOT to break**:
- The unified processor's deduplication and merge logic for Canada (large + renewable CSVs), US (EIA), and international (global DB) plants must produce the same `PowerPlant[]` output.
- The fallback order (S3 → local) must still work.

**Acceptance Criteria**:
- `curl https://your-domain.com/data/eia_aggregated_plant_capacity.json` returns 404.
- `curl https://your-domain.com/data/global_power_plant_database.csv` returns 404.
- All data is only accessible through `/api/*` routes.

---

### S2: Add Server-Side Authentication to All API Routes

**Problem**: All `/api/*` routes accept anonymous requests. The `PasswordGate` component is purely client-side — it blocks the React UI but not direct API calls.

**What to do**:
- Implement a shared auth middleware/helper for all Vercel serverless functions.
- The auth mechanism should use a session token or JWT issued upon successful password entry.
- When the user enters the password in the PasswordGate, the client should call a new `/api/auth` endpoint that validates the password server-side and returns a signed token (JWT with expiry, or a session cookie).
- All subsequent API calls must include this token (via `Authorization: Bearer <token>` header or cookie).
- Every API handler (`fiber-bbox.ts`, `power-plants.ts`, `hifld-proxy.ts`, `hifld-s3.ts`, `wfs/[...path].ts`) must validate the token before processing.
- Invalid/missing tokens should return `401 Unauthorized`.

**Current files that need auth added**:
- `api/fiber-bbox.ts`
- `api/power-plants.ts`
- `api/hifld-proxy.ts`
- `api/hifld-s3.ts`
- `api/wfs/[...path].ts`

**Client-side changes**:
- `PasswordGateContext.tsx` must be updated to store the JWT/session token and provide it to all fetch calls.
- All `fetch()` calls in: `hifldDataLoader.ts`, `efficientDataLoader.ts`, `wfsDataLoader.ts`, `App.tsx` (fiber bbox fetch) must include the auth header.
- Consider a wrapper utility like `authenticatedFetch(url, options)` that automatically injects the token.

**What NOT to break**:
- The password gate UX must remain the same — user enters password, gets access.
- All data loading (power plants, HIFLD, fiber, WFS cables) must continue working after authentication.
- The progressive HIFLD loading (chunked data with progress callbacks) must work with authenticated requests.

**Acceptance Criteria**:
- `curl https://your-domain.com/api/power-plants` without a token returns 401.
- After password entry, the client receives a token and all subsequent data loads work.
- Token has a reasonable expiry (e.g., 24 hours).

---

### S3: Remove Hardcoded S3 URLs from Client Bundle

**Problem**: The S3 bucket URL `https://helios-dataanalysisbucket.s3.us-east-1.amazonaws.com/` appears in:
- `src/utils/unifiedPowerPlantProcessor.ts` (line ~34, fetching `global_power_plant_database.csv`)
- `src/utils/efficientDataLoader.ts` (direct S3 fallback for EIA data)
- `api/fiber-bbox.ts` (line ~150, fallback URL for fiber tiles)
- `api/hifld-s3.ts` (line ~26, fallback URL for HIFLD data)

Any `VITE_*` prefixed env var or hardcoded URL in `src/` files ends up in the client JS bundle.

**What to do**:
- Remove ALL S3 URLs from any file under `src/`. The client must never know the S3 bucket location.
- S3 access should only happen in API handlers (files under `api/`).
- In API handlers, S3 URLs should come from environment variables (`process.env.FIBER_TILES_S3_URL`, `process.env.HIFLD_S3_URL`, `process.env.EIA_DATA_S3_URL`) which are already partially in place but have hardcoded fallbacks.
- Remove the hardcoded fallback URLs from API handlers. If the env var isn't set, the endpoint should return an error, not fall back to a public URL.
- The client should call `/api/power-plants` (which calls S3 server-side) instead of ever calling S3 directly.

**What NOT to break**:
- The data loading fallback chain must still work, but the fallback should be between API endpoints (e.g., `/api/power-plants` fails → try `/api/power-plants-fallback`), not between client-side S3 calls.
- The `unifiedPowerPlantProcessor.ts` must still produce the same merged dataset.

**Acceptance Criteria**:
- `grep -r "s3.us-east-1.amazonaws.com" src/` returns zero matches.
- `grep -r "s3.us-east-1.amazonaws.com" api/` only finds references using `process.env.*` with no inline fallback URLs.
- The production JS bundle contains zero S3 URLs (verify with `grep` on `dist/` output after build).

---

### S4: Server-Side Field Stripping

**Problem**: API endpoints return every field from the source data. The power-plants endpoint returns `plantid`, `generatorid`, `county`, and all raw fields. HIFLD proxy passes through `outFields: '*'` to ArcGIS. Fiber bbox returns full GeoJSON properties.

**What to do**:
- **Power Plants API** (`api/power-plants.ts`): Only return fields needed for rendering: `latitude`, `longitude`, `nameplate-capacity-mw`, `energy-source-desc`, `technology`, `plantName`. Strip `plantid`, `generatorid`, `county`, `net-summer-capacity-mw`, `net-winter-capacity-mw`, `statusDescription` from the response. If any of these stripped fields are used in the frontend for tooltips or filtering, check before removing.
  - Check `App.tsx` hover tooltip rendering and `SidePanel` for which fields are displayed. Only return those.
- **HIFLD Proxy** (`api/hifld-proxy.ts`): Change `outFields` from `*` to only the fields used in rendering: `VOLTAGE`, `VOLT_CLASS`, `OWNER`, `STATUS`, `TYPE`, `SUB_1`, `SUB_2`, `ID`, `OBJECTID`. Do NOT pass through arbitrary `outFields` from the client request.
  - In `hifldDataLoader.ts` the `params` object sets `outFields: '*'` — this should be changed to the specific fields.
- **Fiber BBox API** (`api/fiber-bbox.ts`): Strip GeoJSON feature properties down to only what the frontend needs for display/tooltip. Check what `App.tsx` renders in the fiber hover tooltip.
- **HIFLD S3 API** (`api/hifld-s3.ts`): If the pre-processed S3 file contains extra fields, strip them before sending to client.

**Important**: Before stripping any field, grep the codebase for its usage in tooltips, panels, and calculations. The `TransmissionLine` model interface (`src/models/TransmissionLine.ts`) defines what fields are expected. The hover tooltip in `App.tsx` for HIFLD lines renders `voltage`, `voltClass`, `owner`, `status`, `type`, `sub1`, `sub2`.

**What NOT to break**:
- All hover tooltips must continue showing the same information.
- Voltage-class-based coloring and width in the HIFLD PathLayer must work (uses `voltage` and `voltClass` properties).
- Proximity calculations that use coordinates must not lose coordinate precision.

---

### S5: Rate Limiting

**Problem**: No rate limiting on any endpoint. A scraper can make unlimited requests.

**What to do**:
- Implement per-IP rate limiting on all API endpoints.
- Suggested limits:
  - `/api/fiber-bbox`: 30 requests per minute per IP (viewport panning generates ~1 req/second in bursts)
  - `/api/power-plants`: 10 requests per minute per IP (loaded once on page load)
  - `/api/hifld-s3` and `/api/hifld-proxy`: 10 requests per minute per IP
  - `/api/wfs/*`: 10 requests per minute per IP
- Use Vercel's Edge middleware or an in-memory rate limiter (Map of IP → request timestamps) in the API handlers.
- Return `429 Too Many Requests` with a `Retry-After` header when limit exceeded.
- The fiber-bbox endpoint needs the highest limit because viewport panning triggers many rapid requests (debounced at 300ms on the client, but still bursty during fast panning).

**What NOT to break**:
- Normal map usage (panning, zooming, loading data) must not trigger rate limits.
- The 300ms debounce on fiber cable loading in `App.tsx` (line 956) already throttles requests — rate limits should be generous enough for normal use.

---

### S6: Restrict CORS

**Problem**: All endpoints return `Access-Control-Allow-Origin: *` allowing any website to call the API.

**What to do**:
- Change CORS headers to only allow the actual application origin(s).
- Use an environment variable `ALLOWED_ORIGINS` (comma-separated) for flexibility.
- For development, allow `localhost:*`.
- For production, only allow the Vercel deployment URL(s).
- Apply this in every API handler and in `vercel.json` headers config.

**What NOT to break**:
- The Vite dev proxy (`vite.config.ts`) routes `/api/*` to the local Vercel dev server — CORS may not apply in dev since it's same-origin via the proxy. Verify this.

---

### S7: Secure the Mapbox Token

**Problem**: `VITE_MAPBOX_TOKEN` is embedded in the client bundle because of the `VITE_` prefix.

**What to do**:
- Add URL restrictions on the Mapbox token via the Mapbox account dashboard (restrict to production domain).
- Optionally, proxy Mapbox tile requests through your own API to avoid exposing the token entirely. This is lower priority than the data security items above.

---

## Implementation Order
1. **S2** (Auth) — This is the gatekeeper. Nothing else matters if anyone can call `/api/*`.
2. **S1** (Move public data) — Remove direct file access.
3. **S3** (Remove S3 URLs from client) — Close the bucket access vector.
4. **S4** (Field stripping) — Minimize data exposure even for authenticated users.
5. **S5** (Rate limiting) — Make scraping impractical.
6. **S6** (CORS) — Defense in depth.
7. **S7** (Mapbox token) — Lower priority, prevents token abuse.

## Testing Checklist
After all changes, verify:
- [ ] Unauthenticated `curl` to all `/api/*` endpoints returns 401
- [ ] After password entry, all map layers render correctly
- [ ] `public/data/` directory either doesn't exist or contains no sensitive files
- [ ] Production JS bundle (`dist/assets/*.js`) contains zero S3 URLs
- [ ] All 20 features listed in "Features That MUST Be Preserved" work correctly
- [ ] HIFLD progressive loading with progress bar works
- [ ] Fiber cable viewport-based loading works at zoom >= 4
- [ ] Power plant filtering (source, country, power range, capacity factor, proximity) works
- [ ] Hover tooltips for plants, HIFLD lines, and fiber cables display correct info
- [ ] Address search with radius circle and auto-zoom works
- [ ] Theme toggling works
- [ ] Rate limit of 30 req/min on fiber-bbox is not hit during normal fast panning
