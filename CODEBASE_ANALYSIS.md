# Helios Infrastructure Map: Codebase Analysis & Deep Dive

## Executive Summary
The **Interactive Infrastructure Map of North America** is a high-performance geospatial visualization platform designed to analyze the intersection of power generation and telecommunications infrastructure. Built with a modern React/Deck.gl stack, the application provides real-time filtering, proximity analysis, and multi-source data aggregation.

---

## 🏗 High-Level Architecture
The project follows a decoupled architecture separating the frontend visualization from the data proxy/aggregation layer.

- **Frontend**: React 19 (Vite) + Deck.gl + Mapbox. Managed via a massive state machine in `App.tsx` (a candidate for refactoring into specialized hooks or a Redux/Zustand store).
- **Backend (API)**: Vercel Serverless Functions (`/api`) providing proxy access to external datasets (HIFLD, S3) and handling CORS/caching.
- **Data Layer**: A unified processing pipeline (`unifiedPowerPlantProcessor.ts`) that merges local static files with remote dynamic data.

---

## 📊 Data Sources & Integration
The application aggregates data from several disparate sources to provide a unified infrastructure view:

### 1. Power Plants
- **Dynamic (S3)**: Aggregated plant capacity data fetched via `/api/power-plants.ts`.
- **Static (Local)**: `public/data/power_plants.csv` serves as a baseline or fallback.
- **Unified Processing**: `src/utils/unifiedPowerPlantProcessor.ts` deduplicates and merges these sources into a consistent internal model (`PowerPlant` interface).

### 2. Transmission & Fiber Infrastructure
- **HIFLD (Electric Power Transmission Lines)**: Proxied through `/api/hifld-proxy.ts` to the ArcGIS REST Service (services1.arcgis.com). This provides real-time access to the North American grid backbone.
- **ITU Submarine Cables (WFS)**: Fetched from the International Telecommunication Union's Web Feature Service (`bbmaps.itu.int`). It utilizes a `GetFeature` request for `trx_geocatalogue` to map global data cable connectivity.
- **Telecommunications (GeoJSON)**: Local static data in `public/data/infrastructure.geojson` providing additional terrestrial fiber paths.

---

## ⚙️ Core Technical Implementations

### Performance Optimization
- **Streaming JSON Parser**: Large datasets (like power plant catalogs) are processed using a custom streaming parser (`streamingJsonParser.ts`) to avoid UI blocking and high memory overhead.
- **Spatial Indexing (`RBush`)**: For proximity filtering (e.g., finding plants within 10 miles of a cable), the app uses a R-tree spatial index. This reduces the search complexity from $O(N \times M)$ to $O(log N)$, enabling real-time distance calculations across thousands of features.
- **Throttling & Debouncing**: High-frequency UI interactions (sliders for capacity factors) are managed with custom `useDebounce` hooks to minimize expensive re-renders and spatial queries.

### Proximity Logic
The "Nearby Plants" feature implements a robust geometric filtering system:
- **Haversine Formula**: Used for accurate great-circle distance on a spherical earth.
- **Point-to-Segment Math**: Correctly calculates the shortest distance from a plant coordinate to the nearest point on a polyline (transmission line/cable), rather than just checking vertices.

### Multi-Tier Caching
The application implements a sophisticated caching strategy to handle large geospatial datasets:
- **Memory Cache**: Simple TTL-based cache in API handlers.
- **LocalStorage**: For quick metadata/settings.
- **IndexedDB**: Used for heavy datasets (HIFLD lines) to ensure persistence across sessions without re-fetching megabytes of GeoJSON/JSON data.

---

## 🔍 Engineering Observations & Recommendations

### Technical Debt
- **`App.tsx` Complexity**: At ~2,000 lines, the main component handles too many responsibilities (data fetching, state management, UI rendering, layer definitions).
  - *Recommendation*: Extract the Deck.gl layer logic into a custom `useMapLayers` hook and move the complex filtering logic into a dedicated `FilterContext`.

### Scalability
- **Web Workers**: The app already utilizes workers for some data processing (`eiaDataWorker.ts`). This is an excellent pattern that should be expanded to any remaining heavy geometric calculations.
- **Vector Tiles**: As the dataset grows, moving from GeoJSON/Scatterplot layers to Mapbox/Deck.gl Vector Tiles would significantly improve performance for millions of points.

### Extensibility
- The `api` proxy pattern is well-implemented, making it easy to add new sources (e.g., water infrastructure, cellular towers) by simply adding a new Vercel function and updating the `unifiedProcessor`.
