# Helios Data Analysis Maps - Feature Documentation

This document provides a comprehensive overview of all available features in the Helios Data Analysis Maps frontend. This documentation is intended for frontend developers who need to implement these features in another repository.

## Overview

The Helios Data Analysis Maps provide interactive visualization of power plant data with configurable display options. The interface consists of a map view with a collapsible left sidebar containing various configuration options.

## Available Features

### 1. Plant Sizing Features

#### Base Size Control
- **Type**: Slider control
- **Range**: 1-50 (default: 15)
- **Purpose**: Controls the overall scale of all circles on the map
- **Effect**: Multiplies all circle radii by this factor
- **Implementation**: Uses `sizeMultiplier` state variable

#### Data Emphasis Control
- **Type**: Slider control
- **Range**: 0-3 (default: 0.2)
- **Purpose**: Controls how much the selected data metric affects circle size
- **Effect**: Higher values make differences in the selected metric more pronounced
- **Description**: "Raises plant's capacity effect on size (0 = uniform, 1 = normal, 3 = emphasized)"
- **Implementation**: Uses `capacityWeight` state variable

#### Size Circles By Options
- **Type**: Dropdown selection
- **Options**:
  1. **Nameplate Capacity** (default): Sizes circles by the plant's maximum rated capacity (MW)
  2. **Capacity Factor**: Sizes circles by how efficiently the plant operates (percentage)
  3. **Generation**: Sizes circles by actual energy generated (MWh, converted to MW equivalent)
- **Implementation**: Uses `sizeByOption` state variable with type `SizeByOption`

#### Show Summer Capacity Toggle
- **Type**: Checkbox
- **Default**: false
- **Purpose**: Toggles between summer and winter capacity displays
- **Implementation**: Uses `showSummerCapacity` state variable

### 2. Color Settings Features

#### Color by Fuel Type
- **Type**: Radio button selection
- **Default**: Selected
- **Purpose**: Colors circles based on the fuel type of the power plant
- **Implementation**: Uses `coloringMode` state with value `"fuelType"`

#### Color by Capacity Factor
- **Type**: Radio button selection
- **Purpose**: Colors circles based on the capacity factor of the power plant
- **Implementation**: Uses `coloringMode` state with value `"capacityFactor"`

#### Color by Operating Status
- **Type**: Radio button selection
- **Purpose**: Colors circles based on the operating status of the power plant
- **Implementation**: Uses `coloringMode` state with value `"operatingStatus"`

### 3. Filter Features

#### Fuel Type Filter
- **Type**: Multi-select dropdown
- **Purpose**: Filter plants by fuel type
- **Options**: All fuel types defined in [fuelTypeDisplayNames](file:///Users/amoldericksoans/Documents/Helios/data_analysis/frontend/src/pages/map/MapValueMappings.ts#L25-L53)
- **Implementation**: Uses `filters.fuel_type` state array

#### State Filter
- **Type**: Multi-select dropdown
- **Purpose**: Filter plants by US state
- **Options**: All US states and territories
- **Implementation**: Uses `filters.state` state array

#### Operating Status Filter
- **Type**: Multi-select dropdown
- **Purpose**: Filter plants by operating status
- **Options**: Operating, Standby/Backup, Out of Service, Retired
- **Implementation**: Uses `filters.operating_status` state array

#### Capacity Factor Range Filter
- **Type**: Dual slider controls
- **Purpose**: Filter plants by capacity factor range
- **Range**: 0-100%
- **Implementation**: Uses `filters.min_capacity_factor` and `filters.max_capacity_factor` state variables

#### Capacity Range Filter
- **Type**: Numeric input fields
- **Purpose**: Filter plants by capacity range (MW)
- **Implementation**: Uses `filters.min_capacity` and `filters.max_capacity` state variables

### 4. Map Controls

#### Sidebar Toggle
- **Type**: Collapsible panel
- **Purpose**: Show/hide the configuration sidebar
- **Implementation**: Uses `leftPanelOpen` state variable

#### Reset Map Button
- **Type**: Button
- **Purpose**: Reset all filters and display settings to defaults
- **Implementation**: Resets all state variables to their default values

## Technical Implementation Details

### State Management

The map interface uses React state hooks to manage all configuration options:

```typescript
// Visual parameters
const [showSummerCapacity, setShowSummerCapacity] = useState<boolean>(DEFAULT_SHOW_SUMMER_CAPACITY);
const [sizeMultiplier, setSizeMultiplier] = useState<number>(DEFAULT_SIZE_MULTIPLIER);
const [capacityWeight, setCapacityWeight] = useState<number>(DEFAULT_CAPACITY_WEIGHT);
const [coloringMode, setColoringMode] = useState<MapColorings>(DEFAULT_COLORING_MODE);
const [sizeByOption, setSizeByOption] = useState<SizeByOption>(DEFAULT_SIZE_BY_OPTION);

// Filter parameters
const [filters, setFilters] = useState({
  fuel_type: null as string[] | null,
  state: null as string[] | null,
  operating_status: null as string[] | null,
  min_capacity: null as number | null,
  max_capacity: null as number | null,
  min_capacity_factor: null as number | null,
  max_capacity_factor: null as number | null
});
```

### Message Passing

The sidebar communicates with the map component via `postMessage`:

```typescript
// Visual parameters message
window.parent.postMessage({
  type: 'visualParams',
  showSummerCapacity,
  sizeMultiplier,
  capacityWeight,
  coloringMode,
  sizeByOption
}, '*');

// Filter parameters message
window.parent.postMessage({
  type: 'filterParams',
  filters
}, '*');
```

### Default Values

All configuration options have defined default values:

```typescript
export const DEFAULT_CAPACITY_WEIGHT = 0.2;
export const DEFAULT_SIZE_MULTIPLIER = 15;
export const DEFAULT_COLORING_MODE: MapColorings = "fuelType";
export const DEFAULT_SHOW_SUMMER_CAPACITY = false;
export const DEFAULT_SIZE_BY_OPTION: SizeByOption = "nameplate_capacity";
```

### Data Structures

#### MapColorings Type
```typescript
export type MapColorings = "capacityFactor" | "fuelType" | "operatingStatus";
```

#### SizeByOption Type
```typescript
export type SizeByOption = "nameplate_capacity" | "capacity_factor" | "generation";
```

#### PowerPlant Interface
```typescript
export interface PowerPlant {
  id: number;
  latitude: number;
  longitude: number;
  fuel_type: keyof typeof fuelTypeDisplayNames;
  operating_status: keyof typeof operatingStatusDisplayNames;
  capacity: number;
  generation: number | null;
  capacity_factor: number | null;
}
```

## UI Components

### MapLeftSidebar Component
Located at: `frontend/src/pages/map/components/MapLeftSidebar.tsx`

Main responsibilities:
- Renders all configuration controls
- Manages dropdown states
- Handles filter changes
- Implements throttled updates for slider controls

### MapPage Component
Located at: `frontend/src/pages/map/MapPage.tsx`

Main responsibilities:
- Manages the overall layout
- Handles message passing to the map iframe
- Renders the sidebar and map components

### MapLeafletPage Component
Located at: `frontend/src/pages/map/MapLeafletPage.tsx`

Main responsibilities:
- Renders the actual map using Leaflet
- Processes plant data
- Calculates circle sizes and colors
- Handles user interactions with map markers

## Sizing Algorithm

The circle sizing uses a complex algorithm that combines multiple factors:

1. **Base size calculation** based on zoom level
2. **Data-dependent size** based on the selected metric
3. **User-configured multipliers** for overall scale and emphasis

For detailed information about the sizing algorithm, see: `frontend/CIRCLE_SIZING_DOCUMENTATION.md`

## Performance Considerations

1. **Throttled Updates**: Slider controls use throttling to prevent excessive re-renders
2. **Debounced Filtering**: Filter changes are debounced for better performance
3. **Memoized Calculations**: Expensive calculations are memoized
4. **Batched Updates**: Map markers are updated in batches to maintain UI responsiveness

## Color Coding

### Fuel Type Colors
Defined in [fuelTypeColors](file:///Users/amoldericksoans/Documents/Helios/data_analysis/frontend/src/pages/map/MapValueMappings.ts#L3-L23) mapping:
- Solar: Gold
- Wind: Sky Blue
- Coal types: Dark Gray
- Natural Gas: Steel Blue
- Hydro: Dodger Blue
- Nuclear: Lime Green
- And others...

### Operating Status Colors
Defined in [operatingStatusColors](file:///Users/amoldericksoans/Documents/Helios/data_analysis/frontend/src/pages/map/MapValueMappings.ts#L39-L43) mapping:
- Operating: Green
- Standby/Backup: Yellow
- Out of Service: Red
- Retired: Grey

### Capacity Factor Colors
Dynamically calculated based on value ranges:
- N/A: Dark Gray
- <20%: Bright Green
- 20-40%: Light Green
- 40-60%: Yellow
- 60-80%: Orange
- >80%: Red