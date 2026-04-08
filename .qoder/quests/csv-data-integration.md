# CSV Data Integration Design Document

## 1. Overview

This document outlines the design for replacing the current mixed data integration approach (CSV + JSON) with a clean CSV-only solution for power plant data visualization. The new approach will utilize two newly added CSV files:
1. `Power_Plants,_100_MW_or_more.csv` - Large power plants (≥100 MW)
2. `Renewable_Energy_Power_Plants,_1_MW_or_more.csv` - Renewable energy plants (≥1 MW)

The solution will replace the existing data sources:
- Canadian power plants (currently from `canada_power_plants_2025-09-10T06-37-39-198Z.csv`)
- American power plants (currently from `american_power_plants.json`)

## 2. Current Architecture

The current system uses a mixed approach for data integration:
- Canadian power plants: Processed from a single CSV file with custom parsing logic
- American power plants: Processed from a JSON file with complex aggregation logic to combine generators into plants

Key components:
- `src/utils/powerPlantProcessor.ts` - Processes Canadian CSV data
- `src/utils/americanPowerPlantProcessor.ts` - Processes American JSON data
- `src/utils/csvParser.ts` - Generic CSV parsing utility
- `src/models/PowerPlant.ts` - Data model for power plants

## 3. Proposed Architecture

The new architecture will consolidate all power plant data processing into a single, unified CSV processing pipeline:

```
[Power_Plants,_100_MW_or_more.csv] → [Unified CSV Processor] → [PowerPlant Objects]
[Renewable_Energy_Power_Plants,_1_MW_or_more.csv] → [Unified CSV Processor] → [PowerPlant Objects]
                                      ↓
                            [Data Aggregation Layer]
                                      ↓
                           [Filtered PowerPlant Array]
```

### 3.1 Data Flow

1. Load both CSV files
2. Parse each file using enhanced CSV parser
3. Transform raw CSV data into standardized PowerPlant objects
4. Aggregate data where needed (e.g., combining multiple generators at same facility)
5. Apply filtering and deduplication
6. Return consolidated PowerPlant array for visualization

### 3.2 Key Improvements

- Single data processing pipeline for all sources
- Elimination of JSON processing complexity
- Standardized data model across all sources
- Improved performance through simplified data flow
- Better maintainability with consolidated logic

## 4. Data Model & Mapping

### 4.1 PowerPlant Interface (Existing)
```typescript
export interface PowerPlant {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number]; // [longitude, latitude]
  country: 'CA' | 'US';
}
```

### 4.2 CSV Field Mapping

#### Power_Plants,_100_MW_or_more.csv
| CSV Field | PowerPlant Property | Transformation |
|-----------|---------------------|----------------|
| "Facility Name" | name | Direct mapping |
| "Country" | country | Map "Canada"/"United States" to "CA"/"US" |
| "Latitude" | coordinates[1] | Parse as float |
| "Longitude" | coordinates[0] | Parse as float |
| "Total Capacity (MW)" | output | Parse as float |
| "Total Capacity (MW)" | outputDisplay | Format as "{value} MW" |
| "Primary Energy Source" | source | Map to standardized values |

#### Renewable_Energy_Power_Plants,_1_MW_or_more.csv
| CSV Field | PowerPlant Property | Transformation |
|-----------|---------------------|----------------|
| "Facility Name" | name | Direct mapping |
| "Country" | country | Map "Canada"/"United States" to "CA"/"US" |
| "Latitude" | coordinates[1] | Parse as float |
| "Longitude" | coordinates[0] | Parse as float |
| "Total Capacity (MW)" | output | Parse as float |
| "Total Capacity (MW)" | outputDisplay | Format as "{value} MW" |
| "Primary Renewable Energy Source" | source | Map to standardized values |

### 4.3 Energy Source Mapping

Standardized energy source mappings:
- "Coal" → "coal"
- "Natural Gas" → "gas"
- "Nuclear" → "nuclear"
- "Hydroelectric" → "hydro"
- "Wind" → "wind"
- "Solar" → "solar"
- "Petroleum" → "oil"
- "Biomass" → "biomass"
- "Geothermal" → "geothermal"
- "Tidal" → "tidal"
- "Pumped-Storage Hydroelectric" → "hydro"
- Other values → "other"

## 5. Implementation Plan

### 5.1 New Utility Functions

#### src/utils/unifiedPowerPlantProcessor.ts
This new file will contain all logic for processing both CSV files:

```typescript
// Function to load and process both CSV files
export async function loadAndProcessAllPowerPlants(): Promise<PowerPlant[]> {
  try {
    // Load both CSV files
    const largePlantsResponse = await fetch('/data/Power_Plants,_100_MW_or_more.csv');
    const renewablePlantsResponse = await fetch('/data/Renewable_Energy_Power_Plants,_1_MW_or_more.csv');
    
    const largePlantsText = await largePlantsResponse.text();
    const renewablePlantsText = await renewablePlantsResponse.text();
    
    // Parse both CSV files
    const largePlants = parsePowerPlantCSV(largePlantsText, 'large');
    const renewablePlants = parsePowerPlantCSV(renewablePlantsText, 'renewable');
    
    // Combine and aggregate plants
    const allPlants = [...largePlants, ...renewablePlants];
    const aggregatedPlants = aggregatePowerPlants(allPlants);
    
    return aggregatedPlants;
  } catch (error) {
    console.error('Error loading power plant data:', error);
    return [];
  }
}

// Helper function for parsing and transforming CSV data
function parsePowerPlantCSV(csvText: string, type: 'large' | 'renewable'): PowerPlant[] {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  const plants: PowerPlant[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row = parseCsvRow(line);
    if (row.length < headers.length) continue;
    
    // Create a map of header to value
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ? row[index].trim().replace(/^"|"$/g, '') : '';
    });
    
    // Extract coordinates
    const latitude = parseFloat(entry['Latitude'] || '0');
    const longitude = parseFloat(entry['Longitude'] || '0');
    
    // Extract capacity
    const capacityStr = entry['Total Capacity (MW)'] || '0';
    const capacity = parseFloat(capacityStr.replace(/,/g, '')) || 0;
    
    // Determine energy source based on CSV type
    const source = type === 'large' 
      ? mapEnergySource(entry['Primary Energy Source'] || 'Other')
      : mapEnergySource(entry['Primary Renewable Energy Source'] || 'Other');
    
    // Determine country
    const country = entry['Country'] === 'Canada' ? 'CA' : 'US';
    
    const plant: PowerPlant = {
      id: `plant-${type}-${i}`,
      name: entry['Facility Name'] || 'Unknown Facility',
      output: capacity,
      outputDisplay: `${capacity.toFixed(1)} MW`,
      source: source,
      coordinates: [longitude, latitude],
      country: country,
      rawData: entry
    };
    
    // Only add plants with valid coordinates and positive output
    if (!isNaN(latitude) && !isNaN(longitude) && capacity > 0) {
      plants.push(plant);
    }
  }
  
  return plants;
}

// Function to aggregate generators at same facility
function aggregatePowerPlants(plants: PowerPlant[]): PowerPlant[] {
  // Use a Map to group plants by name and coordinates for aggregation
  const plantMap = new Map<string, PowerPlant>();
  
  for (const plant of plants) {
    // Create a unique key based on name, coordinates, and country
    const key = `${plant.name.toLowerCase()}-${plant.coordinates[0].toFixed(4)}-${plant.coordinates[1].toFixed(4)}-${plant.country}`;
    
    if (plantMap.has(key)) {
      // If we've seen this plant before, aggregate the capacity
      const existingPlant = plantMap.get(key)!;
      existingPlant.output += plant.output;
      existingPlant.outputDisplay = `${existingPlant.output.toFixed(1)} MW`;
      
      // Merge raw data, preserving the first entry's data but updating capacity
      if (existingPlant.rawData && plant.rawData) {
        existingPlant.rawData['Total Capacity (MW)'] = existingPlant.output.toString();
      }
    } else {
      // First time seeing this plant
      plantMap.set(key, plant);
    }
  }
  
  return Array.from(plantMap.values());
}

// Helper function to parse CSV rows with proper quote handling
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Double quotes inside quoted field
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      // Regular character
      current += char;
    }
  }
  
  // Push the last field
  result.push(current);
  return result;
}

// Mapping function for energy sources to match existing source types
function mapEnergySource(source: string): string {
  const sourceMap: Record<string, string> = {
    'Coal': 'coal',
    'Natural Gas': 'gas',
    'Nuclear': 'nuclear',
    'Hydroelectric': 'hydro',
    'Wind': 'wind',
    'Solar': 'solar',
    'Petroleum': 'oil',
    'Biomass': 'biomass',
    'Geothermal': 'geothermal',
    'Tidal': 'tidal',
    'Pumped-Storage Hydroelectric': 'hydro'
  };
  
  return sourceMap[source] || 'other';
}
```

### 5.2 Modified Components

#### src/App.tsx
- Replace calls to `loadAndProcessPowerPlants()` and `loadAndProcessAmericanPowerPlants()` 
- Call new unified function `loadAndProcessAllPowerPlants()`
- Remove country-specific filtering logic (since data will be combined)
- Update the data loading useEffect hook:
  ```typescript
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load all power plant data using the new unified processor
        const powerPlantData = await loadAndProcessAllPowerPlants();
        
        // Load infrastructure data (unchanged)
        const infrastructureData = await loadInfrastructureData('/data/infrastructure.geojson');
        
        // Load WFS submarine cable data (unchanged)
        const wfsCableData = await loadWfsCableData();
        
        setPowerPlants(powerPlantData);
        setTerrestrialLinks(infrastructureData.terrestrialLinks);
        setWfsCables(wfsCableData);
        
        // Initialize filtered sources with all unique sources from the data
        const uniqueSources = new Set(powerPlantData.map(plant => plant.source));
        console.log('Unique sources in data:', Array.from(uniqueSources));
        setFilteredSources(new Set(Array.from(uniqueSources).filter(source => source !== 'other')));
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  ```

- Update the hover panel to display detailed information from rawData:
  ```tsx
  {/* Enhanced Info Panel */}
  {hoverInfo && (
    <div className="info-panel">
      <h3>{hoverInfo.name}</h3>
      <p>Output: {hoverInfo.outputDisplay}</p>
      <p>Source: {hoverInfo.source}</p>
      
      {/* Additional details from rawData */}
      {hoverInfo.rawData && (
        <>
          {hoverInfo.rawData['City (Site Name)'] && <p>City: {hoverInfo.rawData['City (Site Name)']}</p>}
          {hoverInfo.rawData['State / Province / Territory'] && <p>State/Province: {hoverInfo.rawData['State / Province / Territory']}</p>}
          {hoverInfo.rawData['County'] && <p>County: {hoverInfo.rawData['County']}</p>}
          {hoverInfo.rawData['Owner Name (Company)'] && <p>Owner: {hoverInfo.rawData['Owner Name (Company)']}</p>}
          {hoverInfo.rawData['Operator Name'] && <p>Operator: {hoverInfo.rawData['Operator Name']}</p>}
          {hoverInfo.rawData['Address'] && <p>Address: {hoverInfo.rawData['Address']}</p>}
          {hoverInfo.rawData['Zip Code / Postal Code'] && <p>Postal Code: {hoverInfo.rawData['Zip Code / Postal Code']}</p>}
          <p>Coordinates: {hoverInfo.coordinates[1].toFixed(4)}, {hoverInfo.coordinates[0].toFixed(4)}</p>
        </>
      )}
    </div>
  )}
  ```

### 5.3 Data Aggregation Strategy

For facilities with multiple generators:
1. Group generators by facility name and coordinates (with small tolerance for minor coordinate differences)
2. Sum capacities of all generators at same facility
3. Use primary energy source (or most common) for aggregated facility
4. Preserve important metadata from the original entries

Implementation approach:
- Use fuzzy matching for facility names to account for minor spelling differences
- Group facilities within 0.001 degrees of each other (approximately 100m) as the same location
- When aggregating, preserve the first entry's data but update the capacity field
- Handle edge cases where the same facility appears in both CSV files

## 6. Hover Panel Implementation

### 6.1 Enhanced PowerPlant Model
To support detailed hover information, extend the data processing to capture additional fields:

```typescript
export interface PowerPlant {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number]; // [longitude, latitude]
  country: 'CA' | 'US';
  // Additional fields for hover panel
  rawData?: Record<string, string>; // Store all original CSV fields
}
```

### 6.2 Hover Panel Display
On hover, the info panel will show:

#### Most Important Information (Always Displayed First):
1. Facility Name
2. Total Capacity
3. Energy Source

#### Location Details:
4. City (Site Name)
5. State / Province / Territory
6. Country
7. County

#### Ownership & Operation:
8. Owner Name (Company)
9. Operator Name

#### Technical Details:
10. Address
11. Zip Code / Postal Code
12. Latitude & Longitude

#### Additional Information:
13. Reference Period
14. Source Agency

The panel will prioritize the most important information at the top, followed by secondary details. Information will be filtered to only show fields that have data, and the display order will be consistent across all facilities.

## 7. Testing Strategy

### 7.1 Unit Tests
Create unit tests for:
- CSV parsing functions
- Data transformation and mapping
- Energy source standardization
- Data aggregation logic
- Edge case handling (missing data, malformed entries)
- Coordinate grouping and deduplication

### 7.2 Integration Tests
- Verify complete data pipeline from CSV to visualization
- Test hover panel data display
- Validate data filtering and deduplication
- Test performance with large datasets
- Verify data integrity across both CSV sources

### 7.3 Test Data
- Create sample datasets representing edge cases
- Test with facilities that appear in both CSV files
- Validate coordinate grouping works correctly
- Test various energy source mappings

## 8. Performance Considerations

- Both CSV files are large (2,268 and 6,380 lines respectively)
- Implement streaming or chunked processing if needed
- Use efficient data structures for aggregation (Map/HashMap)
- Consider lazy loading for extremely large datasets

## 9. File Structure Changes

1. Add new utility file: `src/utils/unifiedPowerPlantProcessor.ts`
2. Remove deprecated files: 
   - `src/utils/powerPlantProcessor.ts`
   - `src/utils/americanPowerPlantProcessor.ts`
3. Keep existing files:
   - `src/utils/csvParser.ts` (may be used for other CSV parsing needs)
   - `src/models/PowerPlant.ts` (unchanged data model)
4. Data files remain in `public/data/` directory

## 10. Error Handling and Data Validation

1. Implement comprehensive error handling for file loading and parsing
2. Validate data integrity:
   - Check for valid coordinates (latitude: -90 to 90, longitude: -180 to 180)
   - Validate capacity values are positive numbers
   - Ensure required fields are present
3. Handle missing or malformed data gracefully:
   - Skip entries with invalid coordinates
   - Use default values for missing fields
   - Log warnings for data quality issues
4. Implement data deduplication to prevent duplicate entries

## 11. Implementation Summary

To implement this design, the following steps are required:

1. Create `src/utils/unifiedPowerPlantProcessor.ts` with the functions defined in section 5.1
2. Modify `src/App.tsx` to use the new unified processor (section 5.2)
3. Update the hover panel display to show detailed information (section 6.2)
4. Remove the deprecated processor files after verifying the new implementation works
5. Test the implementation thoroughly with both CSV files
6. Validate that the visualization correctly displays all power plants
7. Verify that hover functionality shows all relevant data fields
8. Confirm data deduplication works correctly for facilities in both CSV files