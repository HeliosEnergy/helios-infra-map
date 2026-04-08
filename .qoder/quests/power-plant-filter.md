# Power Plant Country Filter Feature Design

## 1. Overview

This feature adds the ability to filter power plants by country (Canada/USA) in the existing energy infrastructure visualization application. The implementation includes:

1. Integration of American power plant data alongside existing Canadian data
2. Addition of country filtering controls with flag icons
3. Default state showing both countries with toggle capability

## 2. Architecture

### 2.1 Data Model Extensions

The existing `PowerPlant` interface will be extended to include country information:

```typescript
export interface PowerPlant {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number]; // [longitude, latitude]
  country: 'CA' | 'US'; // New field to identify country
}
```

### 2.2 Component Structure

```
App.tsx
├── Map Visualization (DeckGL)
├── Control Panel
│   ├── Layer Controls
│   ├── Energy Size Controls
│   └── Country Filter Controls (NEW)
└── Legend Panel
    ├── Power Plant Type Legend
    └── Infrastructure Legend
```

## 3. Implementation Plan

### 3.1 Data Integration

#### 3.1.1 American Power Plant Processor
Create a new utility function to process American power plant data from JSON:

```typescript
// utils/americanPowerPlantProcessor.ts
export async function loadAndProcessAmericanPowerPlants(): Promise<PowerPlant[]> {
  // Fetch and parse american_power_plants.json
  // Transform data to match PowerPlant interface with country: 'US'
}
```

#### 3.1.2 Combined Data Processor
Update the main data loading function to combine both datasets:

```typescript
// utils/powerPlantProcessor.ts
export async function loadAndProcessAllPowerPlants(): Promise<PowerPlant[]> {
  const canadianPlants = await loadAndProcessPowerPlants(); // Existing function
  const americanPlants = await loadAndProcessAmericanPowerPlants(); // New function
  return [...canadianPlants, ...americanPlants];
}
```

### 3.2 Country Filter Implementation

#### 3.2.1 State Management
Add new state variables to App component:

```typescript
const [showCanadianPlants, setShowCanadianPlants] = useState<boolean>(true);
const [showAmericanPlants, setShowAmericanPlants] = useState<boolean>(true);
```

#### 3.2.2 Data Filtering
Update the filtered power plants calculation:

```typescript
const filteredPowerPlants = powerPlants.filter(plant => {
  // Existing source filtering
  const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
  
  // New country filtering
  const passesCountryFilter = 
    (showCanadianPlants && plant.country === 'CA') || 
    (showAmericanPlants && plant.country === 'US');
  
  return passesSourceFilter && passesCountryFilter;
});
```

### 3.3 UI Components

Add new section to the control panel:

```tsx
<div className="control-section">
  <h3>Countries</h3>
  <div className="country-filter">
    <button 
      className={`country-button ${showCanadianPlants ? 'active' : 'inactive'}`}
      onClick={() => setShowCanadianPlants(!showCanadianPlants)}
    >
      <div className="flag-icon">🇨🇦</div>
    </button>
    <button 
      className={`country-button ${showAmericanPlants ? 'active' : 'inactive'}`}
      onClick={() => setShowAmericanPlants(!showAmericanPlants)}
    >
      <div className="flag-icon">🇺🇸</div>
    </button>
  </div>
</div>
```

## 4. Data Transformation

### 4.1 American Data Processing
Transform American JSON data to match PowerPlant interface:

```typescript
// Sample transformation logic
const transformAmericanPlant = (apiData: any): PowerPlant => ({
  id: `us-${apiData.plantid}-${apiData.generatorid}`,
  name: apiData.plantName,
  output: parseFloat(apiData['nameplate-capacity-mw']) || 0,
  outputDisplay: `${apiData['nameplate-capacity-mw']} MW`,
  source: mapEnergySource(apiData['energy-source-desc']),
  coordinates: [
    parseFloat(apiData.longitude) || 0,
    parseFloat(apiData.latitude) || 0
  ],
  country: 'US'
});
```

### 4.2 Canadian Data Enhancement
Update existing Canadian data processor to add country field:

```typescript
// In existing powerPlantProcessor.ts
return {
  id: `plant-${i}`,
  name: cleanName,
  output: output,
  outputDisplay: outputStr.replace(/^"|"$/g, '').trim() || `${output} MW`,
  source: cleanSource || 'other',
  coordinates: [cleanLng, cleanLat],
  country: 'CA' // Add this field
};
```

### 4.3 Energy Source Mapping
Create mapping function for American energy sources:

```typescript
const mapEnergySource = (source: string): string => {
  const sourceMap: Record<string, string> = {
    'Natural Gas': 'gas',
    'Coal': 'coal',
    'Nuclear': 'nuclear',
    'Hydro': 'hydro',
    'Wind': 'wind',
    'Solar': 'solar',
    'Oil': 'oil',
    'Biomass': 'biomass',
    'Geothermal': 'geothermal'
  };
  
  return sourceMap[source] || 'other';
};
```

## 5. UI/UX Design

### 5.1 Visual Design Specifications

#### 5.1.1 Country Toggle Buttons
- Size: 40x40px for flag icons
- Border: 2px solid for active state, 1px for inactive
- Background: Dark grey for inactive, slightly lighter for active
- Default: Both countries selected (active state)

#### 5.1.2 Flag Icons
- Canadian flag: 🇨🇦
- American flag: 🇺🇸
- Size: 24x24px within buttons

#### 5.1.3 State Indicators
- Active: Solid border, full opacity flag
- Inactive: Dashed border, 50% opacity flag

## 6. Integration Points

### 6.1 Existing Components to Modify
1. `App.tsx` - Main application component
2. `utils/powerPlantProcessor.ts` - Extend to include country field
3. `models/PowerPlant.ts` - Update interface definition

### 6.2 New Components to Create
1. `utils/americanPowerPlantProcessor.ts` - New utility for American data
2. CSS classes for country filter styling

## 7. Testing

1. Test data transformation functions for both Canadian and American data
2. Test country filtering logic with various combinations
3. Verify data loading and processing for both datasets
4. Test UI interactions with country filter controls
5. Validate visualization updates when filters change
6. Verify both countries display correctly by default
7. Test toggling each country on/off independently

## 8. Performance Considerations

- Consider pagination for large American dataset (4.3M records)
- Ensure filtering logic is optimized for large datasets
- Clean up data when components unmount
- Avoid unnecessary state updates