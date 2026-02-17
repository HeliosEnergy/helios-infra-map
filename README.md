# Interactive Infrastructure Map of North America

This project is an interactive infrastructure map of North America that displays power plants and telecommunications infrastructure. It uses React with TypeScript, Vite as the build tool, Tailwind CSS v4 for styling, and Deck.gl with Mapbox for visualization.

## Features

- Full-screen map centered on North America, specifically USA.
- Power plants rendered as dots using `ScatterplotLayer`, sized by capacity and colored by energy source
- Submarine and terrestrial links rendered as lines using `PathLayer`
- Layer controls to toggle visibility of data types
- Static legend explaining color coding
- Info panel on hover showing asset details
- Loading indicator during data fetch
- **Proximity filtering**: Show only power plants within 10 miles of terrestrial links

## Technology Stack

- **Framework**: React 19+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4
- **Mapping**: 
  - `react-map-gl` v8+ for the base map
  - `deck.gl` v9+ for data layers
- **Data Format**: CSV for power plant data, GeoJSON for cable/link data

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Create a `.env` file in the root directory with your Mapbox token and (optionally) the password(s) required to unlock the app:
   ```
   VITE_MAPBOX_TOKEN=your_mapbox_access_token_here
   VITE_APP_PASSWORD=choose_a_password
   ```
   For multiple allowed passwords, use a comma-separated list (e.g. `VITE_APP_PASSWORD=password1,password2`). If `VITE_APP_PASSWORD` is omitted the app loads without the password wall.

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Data Files

- Power plant data: `public/data/power_plants.csv`
- Infrastructure data: `public/data/infrastructure.geojson`

## Color Coding

| Energy Source | Color        | RGB Values   |
|---------------|--------------|--------------|
| Hydro         | Blue         | [31, 119, 180] |
| Gas           | Orange       | [255, 127, 14] |
| Wind          | Green        | [44, 160, 44]  |
| Nuclear       | Red          | [214, 39, 40]  |
| Coal          | Grey         | [100, 100, 100]|
| Solar         | Yellow       | [255, 215, 0]  |
| Other         | Purple       | [148, 103, 189]|

## Proximity Filtering Feature

A new "Nearby Plants" filter has been added to the control panel that allows users to show only power plants within 10 miles of any terrestrial link. This feature:

1. Adds a checkbox in the control panel labeled "Show only plants within 10 miles of terrestrial links"
2. When checked, filters the displayed power plants to only those within 10 miles of any terrestrial link
3. Works in combination with other filters (source, country, power output range)
4. Uses the Haversine formula for accurate distance calculations between coordinates
5. Checks proximity to line segments by calculating distances to each segment of terrestrial links

## Project Structure

```
src/
├── models/              # TypeScript interfaces for data models
├── utils/               # Data processing utilities
├── components/          # React components
├── App.tsx             # Main application component
└── index.css           # Global styles with Tailwind directives
```