import type { PowerPlant } from '../models/PowerPlant';
import { loadEIADataEfficiently } from './efficientDataLoader';

// Function to load and process power plants: Canada from CSV, US from EIA JSON
export async function loadAndProcessAllPowerPlants(): Promise<PowerPlant[]> {
  try {
    // Load Canada data from CSV files
    const largePlantsResponse = await fetch('/data/Power_Plants,_100_MW_or_more.csv');
    const renewablePlantsResponse = await fetch('/data/Renewable_Energy_Power_Plants,_1_MW_or_more.csv');
    const kazakhstanPlantsResponse = await fetch('/data/Kazakhstan_Power_Plants.csv');

    const largePlantsText = await largePlantsResponse.text();
    const renewablePlantsText = await renewablePlantsResponse.text();
    const kazakhstanPlantsText = await kazakhstanPlantsResponse.text();

    // Parse CSV files (now filtered to Canada only)
    const largePlants = parsePowerPlantCSV(largePlantsText, 'large');
    const renewablePlants = parsePowerPlantCSV(renewablePlantsText, 'renewable');
    const kazakhstanPlants = parsePowerPlantCSV(kazakhstanPlantsText, 'kazakhstan');

    // Load US data from EIA JSON using efficient loader
    const usPlants = await loadEIADataEfficiently();

    // Combine and aggregate plants
    const allPlants = [...largePlants, ...renewablePlants, ...kazakhstanPlants, ...usPlants];
    const aggregatedPlants = aggregatePowerPlants(allPlants);

    return aggregatedPlants;
  } catch (error) {
    console.error('Error loading power plant data:', error);
    return [];
  }
}

// Helper function for parsing and transforming CSV data
export function parsePowerPlantCSV(csvText: string, type: 'large' | 'renewable' | 'kazakhstan'): PowerPlant[] {
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
    let source = 'Other';
    if (type === 'large' || type === 'kazakhstan') {
      source = mapEnergySource(entry['Primary Energy Source'] || 'Other');
    } else {
      source = mapEnergySource(entry['Primary Renewable Energy Source'] || 'Other');
    }
    
    // Determine country and skip non-Canada plants for large/renewable types
    let country: 'CA' | 'US' | 'KZ' = 'US'; // Default
    if (entry['Country'] === 'Canada') {
      country = 'CA';
    } else if (entry['Country'] === 'Kazakhstan') {
      country = 'KZ';
    }
    
    // For large/renewable types, only process Canada plants
    if ((type === 'large' || type === 'renewable') && country !== 'CA') continue;

    const plant: PowerPlant = {
      id: `plant-${type}-${i}`,
      name: entry['Facility Name'] || 'Unknown Facility',
      output: capacity,
      outputDisplay: `${capacity.toFixed(1)} MW`,
      source: source,
      coordinates: [longitude, latitude],
      country: country,
      capacityFactor: 100, // Proxy: assume 100% utilization for Canada/Kazakhstan plants
      rawData: entry
    };

    // Only add plants with valid coordinates and positive output
    if (!isNaN(latitude) && !isNaN(longitude) && capacity > 0) {
      plants.push(plant);
    }
  }
  
  return plants;
}

// EIA data structure interface
interface EIADataEntry {
  plantid: string;
  generatorid: string;
  plantName: string;
  latitude: string;
  longitude: string;
  'nameplate-capacity-mw': string;
  'net-summer-capacity-mw': string;
  'net-winter-capacity-mw': string;
  'energy-source-desc': string;
  [key: string]: string;
}

// Function to parse EIA data from S3-hosted eia_aggregated_plant_capacity_with_generation.json for US power plants
export function parseEIAData(jsonData: EIADataEntry[]): PowerPlant[] {
  const plants: PowerPlant[] = [];

  if (!Array.isArray(jsonData)) {
    console.error('Invalid EIA data structure: expected an array');
    return plants;
  }

  for (const item of jsonData) {
    const latitude = parseFloat(item.latitude);
    const longitude = parseFloat(item.longitude);
    const nameplateCapacity = parseFloat(item['nameplate-capacity-mw']) || 0;
    const netSummerCapacity = parseFloat(item['net-summer-capacity-mw']) || 0;
    const netWinterCapacity = parseFloat(item['net-winter-capacity-mw']) || 0;

    // Skip if invalid coordinates or no capacity
    if (isNaN(latitude) || isNaN(longitude) || nameplateCapacity <= 0) {
      continue;
    }

    const source = mapEnergySource(item['energy-source-desc'] || 'Other');

    // Calculate proxy capacity factor: net summer capacity utilization ratio
    const capacityFactor = nameplateCapacity > 0 ? (netSummerCapacity / nameplateCapacity) * 100 : null;

    const plant: PowerPlant = {
      id: `us-${item.plantid}-${item.generatorid}`,
      name: item.plantName || 'Unknown Plant',
      output: nameplateCapacity,
      outputDisplay: `${nameplateCapacity.toFixed(1)} MW`,
      source: source,
      coordinates: [longitude, latitude],
      country: 'US',
      capacityFactor: capacityFactor,
      netSummerCapacity: netSummerCapacity,
      netWinterCapacity: netWinterCapacity,
      rawData: item
    };

    plants.push(plant);
  }

  return plants;
}

// Function to aggregate generators at same facility
export function aggregatePowerPlants(plants: PowerPlant[]): PowerPlant[] {
  // Use a Map to group plants by name and coordinates for aggregation
  const plantMap = new Map<string, PowerPlant>();

  for (const plant of plants) {
    // Create a unique key based on name, coordinates, and country
    const key = `${plant.name.toLowerCase()}-${plant.coordinates[0].toFixed(4)}-${plant.coordinates[1].toFixed(4)}-${plant.country}`;

    if (plantMap.has(key)) {
      // If we've seen this plant before, aggregate the capacity
      const existingPlant = plantMap.get(key)!;
      const oldOutput = existingPlant.output;
      existingPlant.output += plant.output;
      existingPlant.outputDisplay = `${existingPlant.output.toFixed(1)} MW`;

      // Aggregate new capacity fields if present
      if (plant.netSummerCapacity) {
        existingPlant.netSummerCapacity = (existingPlant.netSummerCapacity || 0) + plant.netSummerCapacity;
      }
      if (plant.netWinterCapacity) {
        existingPlant.netWinterCapacity = (existingPlant.netWinterCapacity || 0) + plant.netWinterCapacity;
      }

      // Aggregate capacity factor: weighted average
      if (plant.capacityFactor !== undefined && plant.capacityFactor !== null &&
          existingPlant.capacityFactor !== undefined && existingPlant.capacityFactor !== null) {
        existingPlant.capacityFactor = ((oldOutput * existingPlant.capacityFactor) + (plant.output * plant.capacityFactor)) / existingPlant.output;
      } else if (plant.capacityFactor !== undefined && plant.capacityFactor !== null) {
        existingPlant.capacityFactor = plant.capacityFactor;
      }

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
    // Existing mappings
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
    'Pumped-Storage Hydroelectric': 'hydro',

    // Additional mappings for better coverage
    'Gas': 'gas',
    'Diesel': 'diesel',
    'Oil': 'oil',
    'Waste': 'waste',
    'Biofuel': 'biofuel',
    'Battery': 'battery',
    'Pumped Storage': 'hydro',
    'Run-of-river': 'hydro',
    'Conventional Hydroelectric': 'hydro',
    'Onshore Wind': 'wind',
    'Offshore Wind': 'wind',
    'Photovoltaic': 'solar',
    'Concentrated Solar': 'solar',
    'Combined Cycle': 'gas',
    'Combustion Turbine': 'gas',
    'Steam Turbine': 'coal',
    'Internal Combustion': 'diesel',
    'Landfill Gas': 'biomass',
    'Municipal Solid Waste': 'waste',
    'Wood': 'biomass',
    'Other Biomass': 'biomass',
    'Other Gases': 'gas'
  };

  // Normalize source name for better matching
  const normalized = source.toLowerCase().trim();

  // Try exact match first
  if (sourceMap[source]) return sourceMap[source];

  // Try normalized match
  const normalizedMatch = Object.keys(sourceMap).find(key =>
    key.toLowerCase().trim() === normalized
  );
  if (normalizedMatch) return sourceMap[normalizedMatch];

  // Default to 'other' if no match found
  return 'other';
}