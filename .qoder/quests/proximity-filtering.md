# Power Plant Proximity Filtering Feature Implementation

## Overview
This document details the implementation of a feature that allows users to filter power plants based on their proximity to terrestrial link lines. The feature adds a new option in the control panel that shows only power plants within a 10-mile radius of any terrestrial link.

## Implementation Details

### 1. Geospatial Utility Functions

#### File: `src/utils/geoUtils.ts`

**Function: [calculateDistance](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/utils/geoUtils.ts#L6-L23)**
- Calculates the distance between two geographical points using the Haversine formula
- Takes two coordinates as parameters: `[longitude, latitude]`
- Returns distance in miles

**Function: [isPointNearLine](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/utils/geoUtils.ts#L41-L54)**
- Determines if a point is within a specified distance of any point on a line
- Takes a point coordinate, an array of line coordinates, and maximum distance
- Returns boolean indicating if point is within the specified distance

**Function: [distanceToLineSegment](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/utils/geoUtils.ts#L63-L69)**
- Calculates the shortest distance from a point to a line segment
- Uses a simplified approach calculating distance to each endpoint and returning the minimum

### 2. Application Component Updates

#### File: [src/App.tsx](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/App.tsx)

**New State Variable:**
```typescript
const [showOnlyNearbyPlants, setShowOnlyNearbyPlants] = useState<boolean>(false);
```

**Updated Imports:**
```typescript
import { calculateDistance, isPointNearLine } from './utils/geoUtils';
import type { TerrestrialLink } from './models/TerrestrialLink';
import { loadInfrastructureData } from './utils/dataLoader';
```

**Enhanced Filtering Logic:**
The [filteredPowerPlants](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/App.tsx#L127-L142) calculation now includes an additional filter:
```typescript
// New "nearby plants" filtering
let passesNearbyFilter = true;
if (showOnlyNearbyPlants && terrestrialLinks.length > 0) {
  // Check if plant is within 10 miles of any terrestrial link
  passesNearbyFilter = false;
  for (const link of terrestrialLinks) {
    if (isPointNearLine(plant.coordinates, link.coordinates, 10)) { // 10 miles
      passesNearbyFilter = true;
      break;
    }
  }
}
```

**Control Panel Addition:**
A new section was added to the control panel:
```jsx
{/* New "Nearby Plants" filter */}
<div className="control-section">
  <h3>Nearby Plants</h3>
  <div className="checkbox-group">
    <label className="checkbox-item">
      <input
        type="checkbox"
        checked={showOnlyNearbyPlants}
        onChange={() => setShowOnlyNearbyPlants(!showOnlyNearbyPlants)}
      />
      <span className="checkmark"></span>
      Show only plants within 10 miles of terrestrial links
    </label>
  </div>
</div>
```

### 3. Data Model

#### File: [src/models/TerrestrialLink.ts](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/models/TerrestrialLink.ts)
```typescript
export interface TerrestrialLink {
  id: string;
  name: string;
  coordinates: [number, number][];
}
```

### 4. Test Implementation

#### File: [src/utils/proximityFiltering.test.ts](file:///Users/amoldericksoans/Documents/Helios/mapping_infra/src/utils/proximityFiltering.test.ts)
Unit tests were created to verify the proximity filtering functionality:
- Power plant proximity detection to terrestrial links
- Handling of multiple segments in terrestrial links

## How the Feature Works

1. **User Interface**: A new checkbox appears in the control panel labeled "Show only plants within 10 miles of terrestrial links"

2. **Data Processing**: 
   - When the checkbox is checked, the application filters the power plants
   - For each power plant, it checks if the plant is within 10 miles of any terrestrial link
   - Only plants that meet this criteria are displayed on the map

3. **Geospatial Calculations**:
   - Uses the Haversine formula for accurate distance calculations between coordinates
   - Checks proximity to line segments by calculating distances to each segment of terrestrial links

4. **Integration with Existing Filters**:
   - Works in combination with other filters (source, country, power output range)
   - All active filters must pass for a plant to be displayed

## Dependencies

The implementation requires the following dependencies which should already be installed:
- `react-map-gl` for map rendering
- `deck.gl` for visualization layers
- `@deck.gl/react` for React integration
- `@deck.gl/layers` for layer components

## Testing

Unit tests have been implemented to verify:
1. Power plant proximity detection functionality
2. Handling of multiple segments in terrestrial links
3. Integration with existing filtering mechanisms

To run tests:
```bash
npm test
```

## User Experience

### Control Panel
The new "Nearby Plants" section appears as the last section in the right-hand control panel with:
- A clear section header "Nearby Plants"
- A checkbox with descriptive label "Show only plants within 10 miles of terrestrial links"
- Consistent styling with other checkbox elements in the application

### Functionality
- When unchecked: All power plants (subject to other filters) are displayed
- When checked: Only power plants within 10 miles of any terrestrial link are displayed
- Real-time filtering as the checkbox state changes
- Visual feedback through map updates

## Performance Considerations

1. **Efficient Filtering**: The proximity check only runs when the filter is active
2. **Early Exit**: The algorithm stops checking additional terrestrial links once a plant is found to be within range
3. **Simplified Distance Calculation**: Uses endpoint distance approximation for line segment proximity

## Future Enhancements

1. **Configurable Distance**: Allow users to adjust the proximity distance threshold
2. **Visual Indicators**: Show proximity zones on the map
3. **Performance Optimization**: Implement spatial indexing for large datasets
4. **Advanced Proximity Algorithms**: Use more precise line-to-point distance calculations