# EPIC: Performance Optimization

## Objective
Reduce initial load time from minutes to seconds. Minimize browser memory usage. Ensure smooth 60fps map interactions (pan/zoom) even with all layers active. The user should never wait for data — either it loads progressively or it's already cached.

## Current Performance Bottlenecks

| Bottleneck | Impact | Location |
|---|---|---|
| `/api/power-plants` returns ALL operating plants as a single JSON blob (~50k records) | Multi-second download + parse, ~50MB in browser memory | `api/power-plants.ts`, `src/utils/efficientDataLoader.ts` |
| `filteredPowerPlants` computed inline without `useMemo` on every render | Filters 50k records on every state change | `App.tsx` ~line 820-885 (the filter is actually in a `useMemo` per code review, but the dependency array is very large causing frequent recomputation) |
| HIFLD pre-loads unconditionally on mount even when toggle is off | Fetches 60k transmission lines the user may never view | `App.tsx` useEffect that calls `loadHifldData()` |
| All Deck.gl layers use raw GeoJSON (no vector tiles) | CPU-side data processing for 60k+ HIFLD lines, 25k fiber cables, 50k plants | `App.tsx` layers useMemo |
| Fiber bbox API fetches up to 50 tiles from S3, merges them server-side, returns up to 25k features as one response | Slow response (multiple S3 fetches), large payload | `api/fiber-bbox.ts` |
| Web Worker (`eiaDataWorker.ts`) exists but is never instantiated | Heavy data processing (CSV parse, deduplication, spatial indexing) blocks main thread | `src/utils/eiaDataWorker.ts` — dead code |
| Full `properties` spread on HIFLD lines: `...props` copies every ArcGIS field | Extra memory per feature for unused fields | `hifldDataLoader.ts` line 174 |
| `proximityPlantCount` and `nearbyPlants` useMemos duplicate the same filter logic | Filters 50k plants twice with identical logic | `App.tsx` ~lines 824-885 |
| localStorage caching with LZString compression and chunking | Compression/decompression of multi-MB datasets on main thread | `src/utils/cache.ts` |

---

## Features That MUST Be Preserved
(Same list as EPIC_SECURITY.md — all 20 features. Refer to that document for the full list.)

Abbreviated here for reference:
1. Power Plant ScatterplotLayer with color-by-source, size-by-option
2. Multi-source filtering, country filtering, power range, capacity factor sliders
3. Proximity analysis (RBush + haversine + point-to-segment)
4. WFS submarine cables (PathLayer, orange, pickable)
5. Fiber cables (PathLayer, zoom >= 4, viewport-based, magenta, persistent tooltip)
6. HIFLD transmission lines (PathLayer, voltage-class coloring/width, progressive loading + progress bar)
7. Address search with radius circle + auto-zoom
8. Location stats panel, proximity dialog
9. All hover tooltips (plants, HIFLD lines, fiber cables)
10. Theme toggling, data warnings, SizeBy options

---

## Implementation Stories

### P1: Server-Side Filtering & Pagination for Power Plants

**Problem**: `/api/power-plants` returns every operating plant (~50k records) as one JSON array. The client holds all of them in `useState` and filters on every render.

**Current data flow**:
```
S3 (EIA JSON) → api/power-plants.ts (streaming parse, filter status=OP) → full JSON array response → client stores in powerPlants state → client filters to filteredPowerPlants
```

**What to do**:
- Add query parameters to `/api/power-plants`:
  - `bbox=minLon,minLat,maxLon,maxLat` — only return plants within the viewport
  - `sources=Solar,Wind,Gas` — comma-separated energy source filter
  - `countries=US,CA,KZ` — comma-separated country filter
  - `minCapacity=10&maxCapacity=5000` — nameplate capacity range
  - `minCapacityFactor=0&maxCapacityFactor=100` — capacity factor range
  - `limit=5000&offset=0` — pagination
- The API should filter on the server before sending the response. The server already has the full dataset in its in-memory cache — just apply filters before `res.json()`.
- The client should fetch with current filter parameters and viewport bbox. On viewport change (pan/zoom), re-fetch with new bbox (debounced, like fiber cables already do at 300ms).
- **The `unifiedPowerPlantProcessor.ts` merge/dedup logic** must also move to the server. Currently the client fetches EIA data, Canadian CSVs, and global DB separately and merges them. This should happen in a single API route that returns the unified, deduplicated, filtered result.

**Important architectural note**: The current `filteredPowerPlants` useMemo in App.tsx applies many filters (source, country, power range, capacity factor, proximity). With server-side filtering:
- Source, country, capacity range, and capacity factor filters should move to the API.
- **Proximity filter must remain client-side** because it depends on the RBush spatial index built from WFS cables, which is a client-side data structure. The API doesn't know about cable positions.
- The client should still hold the filtered result in state and apply the proximity filter on top.

**What to change in the client**:
- `App.tsx`: Instead of loading all plants on mount, fetch on viewport change and filter change (debounced).
- `efficientDataLoader.ts`: Update to pass filter params to the API.
- `unifiedPowerPlantProcessor.ts`: The client-side version can be simplified to just call the unified API endpoint. The merge logic moves server-side.
- The `powerPlants` state will hold only the current viewport's filtered plants, not the entire dataset.

**What NOT to break**:
- `powerPlantCounts` (useMemo that counts by source) — this currently counts ALL plants, not just filtered. If we only load viewport plants, we need a separate API call for total counts or accept that counts reflect the viewport.
- `allSourcesInData` — list of unique sources in the dataset. This needs to come from the API (a `/api/power-plants/metadata` endpoint or similar) since the client won't have all plants.
- `proximityPlantCount` and `nearbyPlants` — these filter against ALL plants for proximity. With viewport-based loading, proximity analysis may miss plants outside the current viewport. Consider: when proximity mode is active, load a wider bbox or load all plants within the proximity radius of any visible cable.
- The ScatterplotLayer `getRadius` function uses `powerRange` (min/max across all plants) for normalization. If we only have viewport plants, the range changes as you pan. Either:
  - (a) Send global min/max from the server in a metadata response, or
  - (b) Accept that the range adapts to the viewport (this is actually a reasonable UX).

**Acceptance Criteria**:
- Initial page load fetches < 5000 plants (viewport-bounded), not 50k.
- Panning the map loads new plants for the new viewport.
- All filter controls (source, country, sliders) still work.
- Proximity analysis still works.

---

### P2: Convert to Vector Tiles (PMTiles/MVT) for Fiber and HIFLD

**Problem**: The fiber dataset is ~3GB of GeoJSON tiles on S3. The current approach fetches up to 50 tiles, merges them server-side, and returns up to 25k features as one response. HIFLD loads 60k lines into browser memory.

**This is the single biggest performance win possible.**

**What to do**:

#### Phase A: Fiber Cables → PMTiles
- Convert the existing fiber GeoJSON tiles into a single PMTiles file (or a set of MVT tiles hosted on S3).
- PMTiles is a single-file archive format that supports HTTP range requests — the browser fetches only the tiles it needs for the current viewport/zoom.
- Use [tippecanoe](https://github.com/felt/tippecanoe) to generate the tileset from the GeoJSON source data:
  ```
  tippecanoe -o fiber.pmtiles -z14 -Z2 --drop-densest-as-needed --extend-zooms-if-still-dropping fiber_*.json
  ```
- Host the `.pmtiles` file on S3 (it supports range requests natively).
- On the client, use Deck.gl's `MVTLayer` (or `TileLayer` with a PMTiles source) to render fiber data.
- **This eliminates the entire `api/fiber-bbox.ts` endpoint.** The client fetches tiles directly from the PMTiles file via range requests — each request is tiny (a few KB per tile).
- The `calculateBbox` utility and the 300ms debounced fetch in App.tsx are no longer needed for fiber.

**Current client code to replace** (`App.tsx` lines 913-961):
```typescript
// This entire useEffect for fiber cable loading gets replaced with a single MVTLayer
useEffect(() => {
  if (!showFiberCables) { ... }
  if (viewState.zoom < 4) { ... }
  // fetch /api/fiber-bbox ... parse ... setFiberCables
}, [...]);
```
Replace with:
```typescript
// In the layers useMemo, add:
showFiberCables && new MVTLayer({
  id: 'fiber-cables',
  data: 'https://your-cdn.com/fiber.pmtiles',  // or S3 URL with range requests
  minZoom: 2,
  maxZoom: 14,
  // ... styling same as current PathLayer
})
```

**Note on data security**: If fiber data must be protected (see EPIC_SECURITY.md), the PMTiles file should be served through an authenticated endpoint or use S3 pre-signed URLs with short TTL. Deck.gl's MVTLayer supports custom `fetch` functions where you can inject auth headers.

#### Phase B: HIFLD Transmission Lines → PMTiles
- Same approach. Convert the HIFLD data to PMTiles using tippecanoe.
- This eliminates:
  - `api/hifld-proxy.ts` (ArcGIS pagination)
  - `api/hifld-s3.ts` (pre-processed dump)
  - `src/utils/hifldDataLoader.ts` (the entire multi-stage loading, caching, progressive rendering logic)
  - IndexedDB and localStorage caching for HIFLD
- The HIFLD progress bar UI becomes unnecessary since vector tiles load instantly per viewport.
- The HIFLD PathLayer in App.tsx changes to an MVTLayer.

**What NOT to break**:
- **HIFLD hover tooltips** must still show voltage, owner, status, etc. Vector tiles must include these properties. When running tippecanoe, use `-y VOLTAGE -y VOLT_CLASS -y OWNER -y STATUS -y TYPE -y SUB_1 -y SUB_2 -y ID` to include only needed attributes.
- **Fiber hover tooltips** must still work. Include necessary properties in the fiber tileset.
- **Voltage-class-based coloring and width** on HIFLD lines must still work. The MVTLayer receives features with properties, so the `getColor` and `getWidth` accessors can remain the same.
- **Proximity analysis** currently uses the `hifldLines` array to build an RBush index for "nearby plants" calculations. With vector tiles, `hifldLines` is no longer a client-side array. Two options:
  - (a) Keep a simplified, lower-resolution version of HIFLD in memory for proximity queries (load once, a smaller subset).
  - (b) Move proximity calculation to the server.
  - (c) Use Deck.gl's `getTileData` callback to accumulate features into the RBush index as tiles load.
  - Recommendation: option (c) is most transparent to the existing code.
- **The "show only nearby plants" toggle** depends on `lineIndex` (RBush of cable segments). Currently built from `wfsCables`, not HIFLD. So HIFLD → MVT doesn't break proximity. Verify this assumption.
- **Progressive loading progress bar for HIFLD** — this feature becomes obsolete with vector tiles (tiles load in milliseconds). Remove the progress bar UI cleanly; don't leave dead code.

#### Phase C: Power Plants → Vector Tiles (Optional, depends on P1)
- If P1 (server-side filtering) is implemented, power plants may already load fast enough (< 5k per viewport).
- If performance is still insufficient, convert power plants to PMTiles with a `ScatterplotLayer` → `MVTLayer` migration.
- This is lower priority because scatterplot rendering of 5k points is already fast in Deck.gl.

**Acceptance Criteria**:
- Fiber cables render on zoom with no visible loading delay.
- HIFLD lines render instantly on toggle (no progress bar, no multi-second wait).
- All hover tooltips still work.
- Browser memory usage drops significantly (measure before/after with Chrome DevTools Memory tab).
- The `api/fiber-bbox.ts` endpoint can be deleted (or kept as a legacy fallback).

---

### P3: Lazy-Load HIFLD Data (Quick Win — Do Before P2)

**Problem**: HIFLD data starts loading unconditionally on app mount, even when the HIFLD toggle is off. This wastes bandwidth and memory.

**Current behavior** (`App.tsx`): There is a `useEffect` that calls `loadHifldData()` on mount. The data loads in the background and is cached. When the user toggles HIFLD on, data is already available.

**What to do**:
- Only start loading HIFLD data when `showHifldLines` is `true` (user toggles it on).
- On first toggle, show the progress bar as currently implemented.
- On subsequent toggles (if data is cached), show instantly from IndexedDB/localStorage.
- This is a simple change: add `showHifldLines` to the useEffect dependency array and gate the fetch on it.

**What NOT to break**:
- The progressive loading with progress bar must still work on first load.
- The cache check (IndexedDB → localStorage) must still happen.
- Toggling HIFLD off should NOT clear the data from memory (so toggling back on is instant).
- The background refresh logic (if cached data exists but S3 has newer data) should still work.

**Acceptance Criteria**:
- On initial page load with HIFLD toggled off, zero HIFLD-related network requests.
- Toggling HIFLD on triggers the load and shows the progress bar.
- Second toggle (after cache exists) is instant.

---

### P4: Deduplicate Proximity Filter Computation

**Problem**: `App.tsx` has three `useMemo` blocks that filter `powerPlants` with nearly identical logic:
1. `filteredPowerPlants` (~line 820) — the main filtered array for rendering
2. `proximityPlantCount` (~line 824) — count of plants passing proximity filter
3. `nearbyPlants` (~line 856) — list of plants passing proximity filter

Both `proximityPlantCount` and `nearbyPlants` independently re-filter the full array with the same logic.

**What to do**:
- Consolidate into a single `useMemo` that computes `filteredPowerPlants` and simultaneously tracks `nearbyPlants` and `proximityPlantCount` as byproducts.
- Return an object: `{ filtered, nearbyPlants, proximityPlantCount }`.
- Or: derive `proximityPlantCount` from `nearbyPlants.length` and compute `nearbyPlants` from `filteredPowerPlants` (since nearby is a subset of filtered).

**What NOT to break**:
- `filteredPowerPlants` must produce the exact same array (it's used as the Deck.gl layer data).
- `proximityPlantCount` is displayed in the UI — must be the same number.
- `nearbyPlants` is passed to the ProximityDialog — must be the same list.

---

### P5: Activate the Web Worker for Data Processing

**Problem**: `src/utils/eiaDataWorker.ts` exists with processing logic but is never instantiated. All CSV parsing, deduplication, and processing happens on the main thread.

**What to do**:
- Instantiate the web worker in `App.tsx` or in a utility function.
- Move the heavy processing from `unifiedPowerPlantProcessor.ts` into the worker:
  - CSV parsing (d3-dsv operations on multi-MB strings)
  - Deduplication logic
  - Spatial index building (RBush population)
- The worker should post results back to the main thread via `postMessage`.
- Use `Comlink` or raw `postMessage`/`onmessage` — either is fine.

**What NOT to break**:
- The resulting `PowerPlant[]` array must be identical to what the current main-thread processing produces.
- Error handling must still work (if S3 fails, fallback to local files, etc.).
- Loading state (`loading` boolean in App.tsx) must still be set correctly.

**Note**: If P1 (server-side filtering) is implemented first, much of this processing moves to the server, reducing the need for a client-side worker. Prioritize P1 over P5.

---

### P6: Optimize HIFLD Feature Properties (Quick Win)

**Problem**: In `hifldDataLoader.ts` line 174, every HIFLD feature does `...props` which copies every ArcGIS field into the `properties` object. Most fields are never used.

**What to do**:
- Remove the `...props` spread.
- Only copy the fields that are actually used in rendering and tooltips:
  ```typescript
  properties: {
    voltage: props.VOLTAGE,
    voltClass: props.VOLT_CLASS,
    owner: props.OWNER,
    status: props.STATUS,
    type: props.TYPE,
    sub1: props.SUB_1,
    sub2: props.SUB_2,
    id: props.ID,
    objectId: props.OBJECTID,
  }
  ```
- This reduces memory per feature significantly (ArcGIS returns ~20+ fields per feature).

**Also change `outFields` in the fetch params** (line 76):
```typescript
outFields: 'VOLTAGE,VOLT_CLASS,OWNER,STATUS,TYPE,SUB_1,SUB_2,ID,OBJECTID'
```
Instead of `outFields: '*'`. This reduces the response payload from ArcGIS.

**What NOT to break**:
- HIFLD hover tooltip must still show all displayed properties.
- Voltage-class-based coloring (`getColor`) and width (`getWidth`) must still work.
- The `id` field on `TransmissionLine` must still be set correctly.
- Check if `shapeLength` or `globalId` are used anywhere in the frontend before removing.

**Acceptance Criteria**:
- HIFLD API response size decreases measurably.
- HIFLD PathLayer renders identically.
- Hover tooltips show the same information.

---

### P7: Optimize Client-Side Caching

**Problem**: LZString compression/decompression of multi-MB datasets happens synchronously on the main thread. Large datasets are split into localStorage chunks with complex metadata tracking.

**What to do**:
- If P2 (vector tiles) is implemented, most of this caching becomes unnecessary — delete the HIFLD caching code entirely.
- For remaining cached data (WFS cables, settings), keep the existing approach but move LZString operations to a web worker if they take > 50ms (measure first).
- Consider replacing localStorage + LZString with the Cache API (via a service worker) which handles large responses natively and doesn't block the main thread.
- If keeping IndexedDB for anything, ensure reads/writes are non-blocking (they already are since IndexedDB is async).

**What NOT to break**:
- Returning users should not be forced to re-download data they already have.
- Cache invalidation (version keys like `HIFLD_CACHE_VERSION = 'v4'`) must still work.

---

### P8: Break Up App.tsx (Architecture)

**Problem**: `App.tsx` is ~2000 lines handling data fetching, state management, filtering, layer definitions, and UI rendering. This causes unnecessary re-renders because any state change triggers the entire component to reconcile.

**What to do**:
- Extract custom hooks:
  - `useMapLayers(filteredPowerPlants, wfsCables, fiberCables, hifldLines, ...)` — returns the `layers` array
  - `useDataLoading()` — manages all data fetching, caching, and loading states
  - `usePowerPlantFilters(powerPlants)` — manages filter state and returns `filteredPowerPlants`
  - `useProximityAnalysis(powerPlants, lineIndex)` — manages proximity state and calculations
  - `useFiberCables(viewState, showFiberCables)` — manages fiber viewport loading
  - `useHifldData(showHifldLines)` — manages HIFLD loading with progress
- Move large state to Zustand or React Context to avoid prop drilling and unnecessary re-renders.
- Each hook can use its own `useMemo`/`useCallback` internally without triggering other hooks.

**What NOT to break**:
- Every single feature must continue working. This is a refactor, not a rewrite.
- All state interactions must remain correct (e.g., toggling proximity mode enables the proximity slider, which changes the distance, which triggers a re-filter).
- The layer render order must remain the same (polygon → icon → scatterplot → WFS cables → fiber → HIFLD).

**Acceptance Criteria**:
- `App.tsx` is < 500 lines.
- All 20 features work identically.
- React DevTools Profiler shows fewer unnecessary re-renders.

---

## Implementation Order

### Phase 1: Quick Wins (do first, minimal risk)
1. **P3** — Lazy-load HIFLD (simple useEffect gate)
2. **P6** — Strip HIFLD properties (reduce `...props` spread, change `outFields`)
3. **P4** — Deduplicate proximity filter computation

### Phase 2: Server-Side Optimization
4. **P1** — Server-side filtering & pagination for power plants

### Phase 3: Vector Tiles (biggest impact, most effort)
5. **P2 Phase A** — Fiber cables → PMTiles
6. **P2 Phase B** — HIFLD → PMTiles
7. **P7** — Clean up caching (remove what's no longer needed post-vector-tiles)

### Phase 4: Architecture
8. **P5** — Web Worker for remaining client-side processing
9. **P8** — Break up App.tsx into hooks

---

## Performance Measurement

Before starting, establish baselines. After each phase, re-measure.

| Metric | How to Measure | Target |
|---|---|---|
| Initial load time (time to interactive map) | Chrome DevTools Performance tab, measure from navigation to first meaningful paint with data | < 3 seconds |
| Browser memory (JS heap) | Chrome DevTools Memory tab, take heap snapshot after all layers loaded | < 200MB (currently likely 500MB+) |
| Frame rate during pan/zoom | Chrome DevTools Performance tab, record during fast pan | Consistent 60fps |
| Fiber cable load time (zoom in) | Network tab, measure `/api/fiber-bbox` response time | < 500ms (or instant with PMTiles) |
| HIFLD load time (toggle on) | Measure from toggle to all lines rendered | < 1s from cache, < 5s cold |
| Power plant load time | Network tab, measure `/api/power-plants` response | < 1s |
| API response sizes | Network tab, check transferred bytes | Power plants < 500KB per request, fiber < 200KB per tile |

## Dependencies Between EPICs
- **P1 (server-side filtering) should be coordinated with S2 (auth)** — when adding query params to the API, also add auth checks.
- **P2 (vector tiles) should be coordinated with S3 (remove S3 URLs)** — the PMTiles file URL will be a new S3 reference that needs to be handled securely.
- **P6 (strip properties) overlaps with S4 (field stripping)** — do them together to avoid duplicate work.
