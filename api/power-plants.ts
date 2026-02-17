import * as fs from 'fs/promises';
import * as path from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

type PowerPlant = {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number];
  country: string;
  capacityFactor?: number | null;
  generation?: number;
  netSummerCapacity?: number;
  netWinterCapacity?: number;
  historicalAvgGeneration?: number;
  capacityMW?: number;
  usedCapacity?: number;
  generationGWh?: number;
  rawData?: Record<string, string>;
};

const RATE_LIMIT = {
  key: 'power-plants',
  maxRequests: 10,
  windowMs: 60 * 1000,
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { data: PowerPlant[]; timestamp: number } | null = null;

const RAW_FIELDS_TO_KEEP = [
  'technology',
  'statusDescription',
  'City (Site Name)',
  'State / Province / Territory',
  'County',
  'Owner Name (Company)',
  'Operator Name',
  'Address',
  'Zip Code / Postal Code',
] as const;

const mapEnergySource = (source: string): string => {
  const sourceMap: Record<string, string> = {
    Coal: 'coal',
    'Natural Gas': 'gas',
    Nuclear: 'nuclear',
    Hydroelectric: 'hydro',
    Wind: 'wind',
    Solar: 'solar',
    Petroleum: 'oil',
    Biomass: 'biomass',
    Geothermal: 'geothermal',
    Tidal: 'tidal',
    'Pumped-Storage Hydroelectric': 'hydro',
    Gas: 'gas',
    Diesel: 'diesel',
    Oil: 'oil',
    Waste: 'waste',
    Biofuel: 'biofuel',
    Battery: 'battery',
    'Pumped Storage': 'hydro',
    'Run-of-river': 'hydro',
    'Conventional Hydroelectric': 'hydro',
    'Onshore Wind': 'wind',
    'Offshore Wind': 'wind',
    Photovoltaic: 'solar',
    'Concentrated Solar': 'solar',
    'Combined Cycle': 'gas',
    'Combustion Turbine': 'gas',
    'Steam Turbine': 'coal',
    'Internal Combustion': 'diesel',
    'Landfill Gas': 'biomass',
    'Municipal Solid Waste': 'waste',
    Wood: 'biomass',
    'Other Biomass': 'biomass',
    'Other Gases': 'gas',
  };

  const normalized = source.toLowerCase().trim();
  if (sourceMap[source]) return sourceMap[source];
  const normalizedMatch = Object.keys(sourceMap).find(
    (key) => key.toLowerCase().trim() === normalized
  );
  if (normalizedMatch) return sourceMap[normalizedMatch];
  return 'other';
};

const parseCsvRow = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

const parsePowerPlantCSV = (csvText: string, type: 'large' | 'renewable' | 'kazakhstan'): PowerPlant[] => {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const plants: PowerPlant[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = parseCsvRow(line);
    if (row.length < headers.length) continue;

    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ? row[index].trim().replace(/^"|"$/g, '') : '';
    });

    const latitude = parseFloat(entry.Latitude || '0');
    const longitude = parseFloat(entry.Longitude || '0');
    const capacity = parseFloat((entry['Total Capacity (MW)'] || '0').replace(/,/g, '')) || 0;

    const source =
      type === 'large' || type === 'kazakhstan'
        ? mapEnergySource(entry['Primary Energy Source'] || 'Other')
        : mapEnergySource(entry['Primary Renewable Energy Source'] || 'Other');

    let country = 'US';
    if (entry.Country === 'Canada') country = 'CA';
    else if (entry.Country === 'Kazakhstan') country = 'KZ';

    if ((type === 'large' || type === 'renewable') && country !== 'CA') continue;
    if (isNaN(latitude) || isNaN(longitude) || capacity <= 0) continue;

    plants.push({
      id: `plant-${type}-${i}`,
      name: entry['Facility Name'] || 'Unknown Facility',
      output: capacity,
      outputDisplay: `${capacity.toFixed(1)} MW`,
      source,
      coordinates: [longitude, latitude],
      country,
      capacityFactor: 100,
      rawData: entry,
    });
  }

  return plants;
};

const mapCountryCode = (countryCode: string): string => {
  const explicitMap: Record<string, string> = {
    KAZ: 'KZ',
    ARE: 'AE',
    IND: 'IN',
    KGZ: 'KG',
    CAN: 'CA',
    USA: 'US',
  };
  return explicitMap[countryCode] || countryCode;
};

const parseGlobalPowerPlantCSV = (csvText: string): PowerPlant[] => {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const plants: PowerPlant[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = parseCsvRow(line);
    if (row.length < headers.length) continue;

    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ? row[index].trim().replace(/^"|"$/g, '') : '';
    });

    if (entry.country === 'country' || !entry.country) continue;

    const latitude = parseFloat(entry.latitude || '0');
    const longitude = parseFloat(entry.longitude || '0');
    if (latitude === 0 && longitude === 0) continue;

    const capacity = parseFloat((entry.capacity_mw || '0').replace(/,/g, '')) || 0;
    const generation =
      parseFloat(
        (entry.generation_gwh_2019 || entry.generation_gwh_2017 || entry.estimated_generation_gwh_2017 || '0').replace(
          /,/g,
          ''
        )
      ) || 0;

    const usedCapacity = generation > 0 ? (generation * 1000) / 8760 : 0;
    const capacityFactor = capacity > 0 && usedCapacity > 0 ? (usedCapacity / capacity) * 100 : null;
    const source = mapEnergySource(entry.primary_fuel || 'Other');
    const countryCode = mapCountryCode(entry.country);

    plants.push({
      id: `global-${entry.country.toLowerCase()}-${entry.gppd_idnr || i}`,
      name: entry.name || 'Unknown Plant',
      output: capacity,
      outputDisplay: `${capacity.toFixed(1)} MW`,
      source,
      coordinates: [longitude, latitude],
      country: countryCode,
      capacityMW: capacity,
      usedCapacity,
      generationGWh: generation,
      capacityFactor,
      rawData: {
        usedCapacity: usedCapacity.toString(),
        generation: generation.toString(),
        primaryFuel: entry.primary_fuel,
        otherFuels: [entry.other_fuel1, entry.other_fuel2, entry.other_fuel3].filter(Boolean).join(', '),
        commissioningYear: entry.commissioning_year,
        owner: entry.owner,
        source: entry.source,
        url: entry.url,
      },
    });
  }

  return plants;
};

const aggregatePowerPlants = (plants: PowerPlant[]): PowerPlant[] => {
  const plantMap = new Map<string, PowerPlant>();

  for (const plant of plants) {
    if (!plant.coordinates || plant.coordinates.length !== 2) continue;
    const key = `${plant.name.toLowerCase()}-${plant.coordinates[0].toFixed(4)}-${plant.coordinates[1].toFixed(
      4
    )}-${plant.country}`;

    if (plantMap.has(key)) {
      const existing = plantMap.get(key)!;
      const oldOutput = existing.output;
      existing.output += plant.output;
      existing.outputDisplay = `${existing.output.toFixed(1)} MW`;

      if (plant.netSummerCapacity) {
        existing.netSummerCapacity = (existing.netSummerCapacity || 0) + plant.netSummerCapacity;
      }
      if (plant.netWinterCapacity) {
        existing.netWinterCapacity = (existing.netWinterCapacity || 0) + plant.netWinterCapacity;
      }
      if (
        plant.capacityFactor !== undefined &&
        plant.capacityFactor !== null &&
        existing.capacityFactor !== undefined &&
        existing.capacityFactor !== null
      ) {
        existing.capacityFactor =
          (oldOutput * existing.capacityFactor + plant.output * plant.capacityFactor) / existing.output;
      } else if (plant.capacityFactor !== undefined && plant.capacityFactor !== null) {
        existing.capacityFactor = plant.capacityFactor;
      }

      if (existing.rawData && plant.rawData) {
        existing.rawData['Total Capacity (MW)'] = existing.output.toString();
      }
    } else {
      plantMap.set(key, plant);
    }
  }

  return Array.from(plantMap.values());
};

const readDataFile = async (filename: string): Promise<string> => {
  const filePath = path.join(process.cwd(), 'data', filename);
  return fs.readFile(filePath, 'utf8');
};

const fetchTextWithTimeout = async (url: string, timeoutMs: number): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
};

const loadGlobalPlantDatabaseCsv = async (): Promise<string> => {
  const globalDbS3Url = process.env.GLOBAL_POWER_PLANT_DB_S3_URL;

  if (globalDbS3Url) {
    try {
      return await fetchTextWithTimeout(globalDbS3Url, 30_000);
    } catch (error) {
      console.warn('Failed to load global power DB from S3, falling back to local file:', error);
    }
  }

  return readDataFile('global_power_plant_database.csv');
};

const pickRawFields = (rawData?: Record<string, string>): Record<string, string> | undefined => {
  if (!rawData) return undefined;

  const picked: Record<string, string> = {};
  for (const field of RAW_FIELDS_TO_KEEP) {
    const value = rawData[field];
    if (typeof value === 'string' && value.length > 0) {
      picked[field] = value;
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
};

const sanitizePlant = (plant: PowerPlant): PowerPlant => ({
  id: plant.id,
  name: plant.name,
  output: plant.output,
  outputDisplay: plant.outputDisplay,
  source: plant.source,
  coordinates: plant.coordinates,
  country: plant.country,
  capacityFactor: plant.capacityFactor ?? null,
  generation: plant.generation,
  historicalAvgGeneration: plant.historicalAvgGeneration,
  netSummerCapacity: plant.netSummerCapacity,
  netWinterCapacity: plant.netWinterCapacity,
  capacityMW: plant.capacityMW,
  usedCapacity: plant.usedCapacity,
  generationGWh: plant.generationGWh,
  rawData: pickRawFields(plant.rawData),
});

const buildUnifiedPlantDataset = async (): Promise<PowerPlant[]> => {
  const [largePlantsCsv, renewablePlantsCsv, globalPlantsCsv] = await Promise.all([
    readDataFile('Power_Plants,_100_MW_or_more.csv'),
    readDataFile('Renewable_Energy_Power_Plants,_1_MW_or_more.csv'),
    loadGlobalPlantDatabaseCsv(),
  ]);

  const canadaLarge = parsePowerPlantCSV(largePlantsCsv, 'large');
  const canadaRenewable = parsePowerPlantCSV(renewablePlantsCsv, 'renewable');

  let globalPlants = parseGlobalPowerPlantCSV(globalPlantsCsv);

  // Keep Canada from dedicated CSV datasets for consistency with existing merge behavior.
  globalPlants = globalPlants.filter((plant) => plant.country !== 'CA');

  // Keep US in a dedicated list to preserve existing ordering/merge behavior.
  const usPlants = globalPlants.filter((plant) => plant.country === 'US');
  const nonUsGlobalPlants = globalPlants.filter((plant) => plant.country !== 'US');

  const merged = aggregatePowerPlants([
    ...canadaLarge,
    ...canadaRenewable,
    ...nonUsGlobalPlants,
    ...usPlants,
  ]);

  return merged.map(sanitizePlant);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res)) return;

  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(cache.data);
  }

  try {
    const data = await buildUnifiedPlantDataset();
    cache = { data, timestamp: now };
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error loading power plant dataset:', error);
    return res.status(500).json({ error: 'Failed to load power plants' });
  }
}
