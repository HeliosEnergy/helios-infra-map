# Mapping Infrastructure Application

## Overview

This application provides an interactive mapping and data visualization platform for critical infrastructure, focusing on power generation and transmission, as well as communication networks (fiber and submarine cables). It allows users to explore power plants, high-voltage transmission lines, and fiber optic cable networks globally, with advanced filtering, search, and analysis capabilities. The goal is to provide a comprehensive view of energy and communication infrastructure, aiding in planning, analysis, and situational awareness.

## Features

*   **Interactive Global Map:** Built with Mapbox GL JS and Deck.gl for high-performance rendering of large geospatial datasets.
*   **Multiple Data Layers:**
    *   **Power Plants:** Displays global power generation facilities, color-coded by energy source and dynamically sized by nameplate capacity, capacity factor, or historical generation.
    *   **Submarine Communication Cables:** Visualizes international submarine fiber optic cable networks.
    *   **High-Voltage Transmission Lines (HIFLD):** Renders detailed high-voltage electricity transmission infrastructure, styled by voltage class.
    *   **Fiber Optic Cables:** Shows regional fiber optic cable networks, dynamically loaded based on map viewport and zoom level.
*   **Comprehensive Filtering & Search:**
    *   **Power Plant Filters:** Filter by energy source, country, power output range, capacity factor range, and operational status.
    *   **Proximity Filtering:** Identify power plants within a user-defined radius of submarine cables, leveraging an efficient spatial index.
    *   **Address Search:** Geocode addresses and zoom the map to specific locations.
    *   **Plant Search & Selection:** Search for specific power plants and highlight them on the map.
*   **Detailed Information Panels:**
    *   **On-Hover/Click Tooltips:** Provides contextual information for power plants, transmission lines, and fiber cables.
    *   **Persistent Info Panels:** Detailed side panels for selected features, offering in-depth data and call-to-action buttons (e.g., Google Search, Google Maps).
    *   **Location Statistics Panel:** Analyze power infrastructure within a custom radius around a selected point, displaying aggregated data.
*   **Performance Optimizations:**
    *   Client-side data caching (IndexedDB, localStorage) and progressive loading for large datasets like HIFLD transmission lines.
    *   Viewport-based dynamic loading and server-side tile caching for fiber cables.
    *   Spatial indexing (RBush) for efficient proximity analysis.
    *   Debouncing for user inputs and map interactions.
*   **Theming:** Supports both light and dark map styles.
*   **Access Control:** A `PasswordGate` component provides basic access control for the application.

## Data Sources & Processing

The application integrates and processes data from various sources to provide a unified view of infrastructure.

### Power Plants

Power plant data is sourced from multiple datasets and unified:

*   **Canadian Power Plants:** Loaded from local CSV files located in `public/data/` (e.g., `Power_Plants,_100_MW_or_more.csv`, `Renewable_Energy_Power_Plants,_1_MW_or_more.csv`).
*   **Global Power Plant Database:** Used for US, Kazakhstan, UAE, India, Kyrgyzstan, and other international power plants.
    *   **Primary Source:** AWS S3 bucket (`https://helios-dataanalysisbucket.s3.us-east-1.amazonaws.com/global_power_plant_database.csv`) for the latest data.
    *   **Fallback Source:** Local CSV file (`public/data/global_power_plant_database.csv`) if S3 is unavailable.
*   **Processing:**
    *   `src/utils/unifiedPowerPlantProcessor.ts` handles the fetching, parsing (CSV, GeoJSON), and aggregation of power plant data.
    *   It normalizes energy sources (e.g., "Natural Gas" to "gas") and maps country codes.
    *   Multiple generators at the same facility are aggregated to represent the total capacity at that location.
    *   Calculates `usedCapacity` and `capacityFactor` from generation data (GWh) where available.

### Submarine Communication Cables

*   **Source:** ITU (International Telecommunication Union) WFS (Web Feature Service) via a Vercel API proxy (`/itu-proxy/geoserver/itu-geocatalogue/ows`).
*   **Processing:**
    *   `src/utils/wfsDataLoader.ts` fetches data from the proxied WFS endpoint.
    *   GeoJSON responses are parsed and transformed into `Cable` objects.
    *   Client-side caching (localStorage) is employed to store and retrieve cable data efficiently.
    *   Includes a local GeoJSON fallback for offline development or API failures.

### HIFLD (Homeland Infrastructure Foundation-Level Data) Transmission Lines

This dataset is large and requires a sophisticated loading strategy:

*   **Primary Source (Pre-processed):** AWS S3 bucket via a Vercel API proxy (`/api/hifld-s3`) for fast retrieval of pre-processed, simplified HIFLD GeoJSON data.
*   **Fallback Source (Original API):** HIFLD ArcGIS REST API via a Vercel API proxy (`/api/hifld-proxy`). This is used for background refreshing or if the S3 source is unavailable. It involves paginated requests due to the dataset's size.
*   **Processing:**
    *   `src/utils/hifldDataLoader.ts` implements a multi-stage loading strategy.
    *   Prioritizes immediate return from client-side cache (IndexedDB, then localStorage) for responsiveness.
    *   Triggers background refreshes from S3 if cached data is served.
    *   Progressive loading: Data is loaded in chunks, allowing the map to update incrementally.
    *   Robust caching mechanisms are in place, including `lz-string` compression for localStorage and IndexedDB for larger data volumes, with cache invalidation policies.
    *   Long transmission lines are simplified (reduced coordinate points) to optimize rendering performance.

### Fiber Optic Cables (Regional)

*   **Source:** Pre-processed tiled GeoJSON files stored on an AWS S3 bucket (`https://helios-dataanalysisbucket.s3.us-east-1.amazonaws.com/fiber-tiles/`) or local filesystem (`public/fiber-tiles/` in development).
*   **Processing:**
    *   A Vercel API route (`/api/fiber-bbox.ts`) handles requests for fiber data within a given bounding box.
    *   The API calculates intersecting geographic tiles, fetches their GeoJSON content, merges features, and applies server-side caching (in-memory) for performance.
    *   It implements server-side limits on the number of tiles and features returned to prevent client-side performance bottlenecks with dense areas.

## Tech Stack

*   **Frontend:**
    *   **Framework:** React (TypeScript)
    *   **Build Tool:** Vite
    *   **Routing:** `react-router-dom`
    *   **Styling:** Tailwind CSS, PostCSS, Autoprefixer
    *   **Mapping & Visualization:**
        *   Mapbox GL JS (`mapbox-gl`, `react-map-gl`)
        *   Deck.gl (`deck.gl`, `@deck.gl/react`, `@deck.gl/layers`)
*   **Backend (Vercel Serverless Functions - API Routes):**
    *   Node.js (`@vercel/node`)
    *   Used for:
        *   Proxying requests to external APIs (ITU WFS, HIFLD ArcGIS REST API).
        *   Serving pre-processed data from S3 (HIFLD, Fiber Tiles).
        *   Implementing bbox-based tile retrieval and merging for fiber cables.
*   **Data Handling & Utilities:**
    *   `d3-dsv`: CSV parsing.
    *   `lz-string`: Data compression for client-side caching.
    *   `rbush`: High-performance 2D spatial index for proximity queries.
    *   `recharts`: Charting library for data visualizations.
    *   `lucide-react`: Icon library.
*   **Testing:** Vitest
*   **Linting:** ESLint, TypeScript ESLint
*   **Development Tools:** Husky (Git Hooks)

## Architecture

The application follows a client-side rendered (CSR) architecture, powered by React and Vite. Most data processing, filtering, and visualization logic resides within the browser. However, due to the nature of external data sources (CORS restrictions, large datasets, or private access), several Vercel Serverless Functions (`api/` routes) serve as critical backend components. These functions act as proxies, data aggregators, and tile servers, optimizing data delivery to the frontend and abstracting complex data fetching logic. Client-side caching (IndexedDB and localStorage) is extensively used to enhance performance and provide a smoother user experience by minimizing repeated data fetches.

## Setup & Development

To get the project up and running locally:

1.  **Clone the repository:**
    ```bash
    git clone [repository-url]
    cd mapping_infra
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:**
    Create a `.env` file in the project root based on `.env.example` (if available) or the following:
    ```
    VITE_MAPBOX_TOKEN=YOUR_MAPBOX_ACCESS_TOKEN
    # Optional: FIBER_TILES_S3_URL=YOUR_S3_BUCKET_URL_FOR_FIBER_TILES
    # Optional: FIBER_TILE_SIZE=5 # or 2
    ```
    You will need a Mapbox Access Token.
4.  **Run in development mode:**
    ```bash
    npm run dev
    ```
    This will start the Vite development server.
5.  **Build for production:**
    ```bash
    npm run build
    ```
    This will compile the application for deployment.
6.  **Run tests:**
    ```bash
    npm test
    ```
7.  **Run linting:**
    ```bash
    npm run lint
    ```

Remember to consult the `package.json` for all available scripts.
