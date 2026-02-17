import type { PowerPlant } from '../models/PowerPlant';
import { authenticatedFetch } from './auth';

// Function to load and process power plants: Canada from CSV, US from EIA JSON, Global DB for Kazakhstan
export async function loadAndProcessAllPowerPlants(): Promise<PowerPlant[]> {
  try {
    const response = await authenticatedFetch('/api/power-plants', {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load power plants: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Invalid power plant payload from API');
    }

    return payload as PowerPlant[];
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
    // Skip plants with invalid coordinates
    if (!plant.coordinates || !Array.isArray(plant.coordinates) || plant.coordinates.length !== 2) {
      console.warn('Skipping plant with invalid coordinates:', plant.name, plant.coordinates);
      continue;
    }
    
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

// New parser for global power plant database with capacity calculations
export function parseGlobalPowerPlantCSV(csvText: string): PowerPlant[] {
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
    
           // Process all countries from global database (skip header row)
           if (entry['country'] === 'country' || !entry['country']) continue;
    
    
    
    // Extract coordinates
    const latitude = parseFloat(entry['latitude'] || '0');
    const longitude = parseFloat(entry['longitude'] || '0');
    
    // Skip if no valid coordinates
    if (latitude === 0 && longitude === 0) continue;
    
    // Extract capacity (installed power)
    const capacityStr = entry['capacity_mw'] || '0';
    const capacity = parseFloat(capacityStr.replace(/,/g, '')) || 0;
    
    // Extract estimated generation (actual output) - use generation_gwh_2019 if available, otherwise generation_gwh_2017, otherwise estimated_generation_gwh_2017
    const generationStr = entry['generation_gwh_2019'] || entry['generation_gwh_2017'] || entry['estimated_generation_gwh_2017'] || '0';
    const generation = parseFloat(generationStr.replace(/,/g, '')) || 0;
    
    // Calculate used capacity: generation_gwh * 1000 / 8760 (since 1 year = 8760 hours)
    const usedCapacity = generation > 0 ? (generation * 1000) / 8760 : 0;
    
    // Calculate capacity factor: (usedCapacity / capacity) * 100
    const capacityFactor = capacity > 0 && usedCapacity > 0 ? (usedCapacity / capacity) * 100 : null;
    
    // Map energy source
    const source = mapEnergySource(entry['primary_fuel'] || 'Other');
    
           // Determine country code - map from 3-letter codes to our internal codes
           const countryCode = mapCountryCode(entry['country']);
    
    const plant: PowerPlant = {
      id: `global-${entry['country'].toLowerCase()}-${entry['gppd_idnr'] || i}`,
      name: entry['name'] || 'Unknown Plant',
      output: capacity,
      outputDisplay: `${capacity.toFixed(1)} MW`,
      source,
      coordinates: [longitude, latitude],
      country: countryCode as any,
      // Add new capacity fields
      capacityMW: capacity,
      usedCapacity: usedCapacity,
      generationGWh: generation,
      capacityFactor: capacityFactor,
      rawData: {
        // Store additional calculated metrics
        usedCapacity: usedCapacity.toString(),
        generation: generation.toString(),
        primaryFuel: entry['primary_fuel'],
        otherFuels: [entry['other_fuel1'], entry['other_fuel2'], entry['other_fuel3']].filter(Boolean).join(', '),
        commissioningYear: entry['commissioning_year'],
        owner: entry['owner'],
        source: entry['source'],
        url: entry['url']
      }
    };
    
    plants.push(plant);
    
  }
  
  return plants;
}

// Function to map 3-letter country codes to our internal country codes
function mapCountryCode(countryCode: string): string {
  const countryMap: Record<string, string> = {
    // Existing mappings
    'KAZ': 'KZ',
    'ARE': 'AE', 
    'IND': 'IN',
    'KGZ': 'KG',
    'CAN': 'CA',
    'USA': 'US',
    
    // Major countries with many power plants
    'CHN': 'CHN', // China
    'GBR': 'GBR', // United Kingdom
    'BRA': 'BRA', // Brazil
    'FRA': 'FRA', // France
    'DEU': 'DEU', // Germany
    'ESP': 'ESP', // Spain
    'RUS': 'RUS', // Russia
    'JPN': 'JPN', // Japan
    'AUS': 'AUS', // Australia
    'PRT': 'PRT', // Portugal
    'CZE': 'CZE', // Czech Republic
    'ITA': 'ITA', // Italy
    'CHL': 'CHL', // Chile
    'NOR': 'NOR', // Norway
    'MEX': 'MEX', // Mexico
    'VNM': 'VNM', // Vietnam
    'ARG': 'ARG', // Argentina
    'THA': 'THA', // Thailand
    'POL': 'POL', // Poland
    'FIN': 'FIN', // Finland
    'IDN': 'IDN', // Indonesia
    'SWE': 'SWE', // Sweden
    'CHE': 'CHE', // Switzerland
    'TUR': 'TUR', // Turkey
    'KOR': 'KOR', // South Korea
    'PHL': 'PHL', // Philippines
    'IRN': 'IRN', // Iran
    'ZAF': 'ZAF', // South Africa
    'AUT': 'AUT', // Austria
    'SAU': 'SAU', // Saudi Arabia
    'GRC': 'GRC', // Greece
    'GTM': 'GTM', // Guatemala
    'URY': 'URY', // Uruguay
    'NLD': 'NLD', // Netherlands
    'BEL': 'BEL', // Belgium
    'ROU': 'ROU', // Romania
    'UKR': 'UKR', // Ukraine
    'PAK': 'PAK', // Pakistan
    'EGY': 'EGY', // Egypt
    'ISR': 'ISR', // Israel
    'IRL': 'IRL', // Ireland
    'DZA': 'DZA', // Algeria
    'BGD': 'BGD', // Bangladesh
    'MYS': 'MYS', // Malaysia
    'LKA': 'LKA', // Sri Lanka
    'DNK': 'DNK', // Denmark
    'MAR': 'MAR', // Morocco
    'VEN': 'VEN', // Venezuela
    'NZL': 'NZL', // New Zealand
    'BGR': 'BGR', // Bulgaria
    'HND': 'HND', // Honduras
    'TWN': 'TWN', // Taiwan
    'MMR': 'MMR', // Myanmar
    'JOR': 'JOR', // Jordan
    'PER': 'PER', // Peru
    'PRK': 'PRK', // North Korea
    'SVK': 'SVK', // Slovakia
    'IRQ': 'IRQ', // Iraq
    'TUN': 'TUN', // Tunisia
    'CRI': 'CRI', // Costa Rica
    'BOL': 'BOL', // Bolivia
    'COL': 'COL', // Colombia
    'HRV': 'HRV', // Croatia
    'BLR': 'BLR', // Belarus
    'MUS': 'MUS', // Mauritius
    'KEN': 'KEN', // Kenya
    'ECU': 'ECU', // Ecuador
    'LAO': 'LAO', // Laos
    'ISL': 'ISL', // Iceland
    'BIH': 'BIH', // Bosnia and Herzegovina
    'SDN': 'SDN', // Sudan
    'GEO': 'GEO', // Georgia
    'SYR': 'SYR', // Syria
    'HUN': 'HUN', // Hungary
    'PAN': 'PAN', // Panama
    'EST': 'EST', // Estonia
    'UZB': 'UZB', // Uzbekistan
    'SLV': 'SLV', // El Salvador
    'NIC': 'NIC', // Nicaragua
    'KHM': 'KHM', // Cambodia
    'ZMB': 'ZMB', // Zambia
    'PNG': 'PNG', // Papua New Guinea
    'DOM': 'DOM', // Dominican Republic
    'COD': 'COD', // Democratic Republic of the Congo
    'SGP': 'SGP', // Singapore
    'NPL': 'NPL', // Nepal
    'CUB': 'CUB', // Cuba
    'AZE': 'AZE', // Azerbaijan
    'AGO': 'AGO', // Angola
    'NGA': 'NGA', // Nigeria
    'NAM': 'NAM', // Namibia
    'ETH': 'ETH', // Ethiopia
    'SRB': 'SRB', // Serbia
    'QAT': 'QAT', // Qatar
    'OMN': 'OMN', // Oman
    'MKD': 'MKD', // North Macedonia
    'MDG': 'MDG', // Madagascar
    'LBY': 'LBY', // Libya
    'FJI': 'FJI', // Fiji
    'UGA': 'UGA', // Uganda
    'TZA': 'TZA', // Tanzania
    'RWA': 'RWA', // Rwanda
    'TJK': 'TJK', // Tajikistan
    'SEN': 'SEN', // Senegal
    'JAM': 'JAM', // Jamaica
    'KWT': 'KWT', // Kuwait
    'GIN': 'GIN', // Guinea
    'AFG': 'AFG', // Afghanistan
    'SVN': 'SVN', // Slovenia
    'MNG': 'MNG', // Mongolia
    'COG': 'COG', // Republic of the Congo
    'CMR': 'CMR', // Cameroon
    'CIV': 'CIV', // Ivory Coast
    'BHR': 'BHR', // Bahrain
    'ARM': 'ARM', // Armenia
    'ALB': 'ALB', // Albania
    'YEM': 'YEM', // Yemen
    'TKM': 'TKM', // Turkmenistan
    'NER': 'NER', // Niger
    'MRT': 'MRT', // Mauritania
    'LBN': 'LBN', // Lebanon
    'BFA': 'BFA', // Burkina Faso
    'TTO': 'TTO', // Trinidad and Tobago
    'SWZ': 'SWZ', // Eswatini
    'MDA': 'MDA', // Moldova
    'LTU': 'LTU', // Lithuania
    'GUF': 'GUF', // French Guiana
    'GHA': 'GHA', // Ghana
    'GAB': 'GAB', // Gabon
    'MWI': 'MWI', // Malawi
    'LVA': 'LVA', // Latvia
    'GUY': 'GUY', // Guyana
    'BTN': 'BTN', // Bhutan
    'MLI': 'MLI', // Mali
    'CPV': 'CPV', // Cape Verde
    'BRN': 'BRN', // Brunei
    'BDI': 'BDI', // Burundi
    'TGO': 'TGO', // Togo
    'SLE': 'SLE', // Sierra Leone
    'PRY': 'PRY', // Paraguay
    'MOZ': 'MOZ', // Mozambique
    'MNE': 'MNE', // Montenegro
    'GNQ': 'GNQ', // Equatorial Guinea
    'CYP': 'CYP', // Cyprus
    'ZWE': 'ZWE', // Zimbabwe
    'LUX': 'LUX', // Luxembourg
    'LBR': 'LBR', // Liberia
    'KOS': 'KOS', // Kosovo
    'GMB': 'GMB', // Gambia
    'ERI': 'ERI', // Eritrea
    'CAF': 'CAF', // Central African Republic
    'BWA': 'BWA', // Botswana
    'BEN': 'BEN', // Benin
    'ATA': 'ATA', // Antarctica
    'SUR': 'SUR', // Suriname
    'PSE': 'PSE', // Palestine
    'LSO': 'LSO', // Lesotho
    'LCA': 'LCA', // Saint Lucia
    'GNB': 'GNB', // Guinea-Bissau
    'ESH': 'ESH', // Western Sahara
    'DJI': 'DJI'  // Djibouti
  };

  return countryMap[countryCode] || countryCode; // Return original code if not found
}
