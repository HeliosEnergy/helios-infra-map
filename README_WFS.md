# ITU WFS Submarine Cable Integration

This document describes the integration of submarine cable data from the International Telecommunication Union (ITU) Web Feature Service (WFS).

## Overview

The integration fetches real-time submarine cable data from the ITU's geoserver and displays it on the map alongside existing power plant and terrestrial link data.

## Data Source

The ITU WFS service is accessed using the following configuration:

- **Base URL**: https://bbmaps.itu.int/geoserver/itu-geocatalogue/ows
- **Service**: WFS
- **Version**: 1.0.0
- **Request**: GetFeature
- **Type Name**: itu-geocatalogue:trx_geocatalogue
- **Output Format**: application/json

## Implementation Details

### Components

1. **WFS Data Loader** (`src/utils/wfsDataLoader.ts`): 
   - Fetches data from the ITU WFS service
   - Implements fallback to local test data when the service is unavailable
   - Uses proxy configuration for development environment

2. **Data Processor** (`src/utils/geoJsonParser.ts`):
   - Extended to handle ITU GeoJSON format
   - Processes LineString geometries into Cable objects

3. **Vite Configuration** (`vite.config.ts`):
   - Configured proxy for development to handle CORS restrictions

4. **Application Integration** (`src/App.tsx`):
   - Loads WFS data on component mount
   - Displays submarine cables as a separate layer
   - Added layer control for submarine cables

### Fallback Mechanism

When the ITU WFS service is unavailable, the application falls back to using local test data to ensure functionality is maintained.

## Development

In development mode, the application uses a proxy to access the ITU service due to CORS restrictions. The proxy is configured in `vite.config.ts`.

In production, requests go directly to the ITU server.

## Testing

Unit tests are included for the data processing functions to ensure correct handling of various data formats and edge cases.

## Troubleshooting

If submarine cable data is not displaying:
1. Check network requests in browser dev tools
2. Verify the ITU service is accessible
3. Check browser console for errors
4. Confirm proxy configuration is correct for development