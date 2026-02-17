import * as fs from 'fs/promises';
import * as path from 'path';

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

export type PlantFilters = {
  bbox?: [number, number, number, number];
  sources?: string[];
  countries?: string[];
  statuses?: string[];
  minCapacity?: number;
  maxCapacity?: number;
  minCapacityFactor?: number;
  maxCapacityFactor?: number;
};

export type Pagination = {
  limit: number;
  offset: number;
};

export type PowerPlantPage = {
  data: PowerPlant[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type CountryMetadata = {
  code: string;
  count: number;
  usedCapacity?: number;
};

export type PowerPlantMetadata = {
  total: number;
  sources: string[];
  sourceCounts: Record<string, number>;
  countries: CountryMetadata[];
  statuses: string[];
  powerRange: {
    min: number;
    max: number;
  };
};

const CACHE_TTL_MS = 5 * 60 * 1000;

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

let datasetCache: { data: PowerPlant[]; timestamp: number } | null = null;

const toSafeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

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

    const key = `${plant.name.toLowerCase()}-${plant.coordinates[0].toFixed(4)}-${plant.coordinates[1].toFixed(4)}-${plant.country}`;

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
  globalPlants = globalPlants.filter((plant) => plant.country !== 'CA');

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

export const getUnifiedPowerPlantDataset = async (): Promise<PowerPlant[]> => {
  const now = Date.now();

  if (datasetCache && now - datasetCache.timestamp < CACHE_TTL_MS) {
    return datasetCache.data;
  }

  const data = await buildUnifiedPlantDataset();
  datasetCache = { data, timestamp: now };
  return data;
};

const normalizeStringList = (value: string[] | undefined): Set<string> | null => {
  if (!value || value.length === 0) return null;

  const items = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? new Set(items) : null;
};

const getPlantStatus = (plant: PowerPlant): string => plant.rawData?.statusDescription || 'N/A';

export const applyPlantFilters = (plants: PowerPlant[], filters: PlantFilters): PowerPlant[] => {
  const sourceSet = normalizeStringList(filters.sources);
  const countrySet = normalizeStringList(filters.countries);
  const statusSet = normalizeStringList(filters.statuses);

  const minCapacity = filters.minCapacity ?? Number.NEGATIVE_INFINITY;
  const maxCapacity = filters.maxCapacity ?? Number.POSITIVE_INFINITY;
  const minCapacityFactor = filters.minCapacityFactor ?? Number.NEGATIVE_INFINITY;
  const maxCapacityFactor = filters.maxCapacityFactor ?? Number.POSITIVE_INFINITY;

  return plants.filter((plant) => {
    const [lon, lat] = plant.coordinates;

    if (filters.bbox) {
      const [minLon, minLat, maxLon, maxLat] = filters.bbox;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
        return false;
      }
    }

    if (sourceSet && !sourceSet.has(plant.source)) {
      return false;
    }

    if (countrySet && !countrySet.has(plant.country)) {
      return false;
    }

    if (statusSet && !statusSet.has(getPlantStatus(plant))) {
      return false;
    }

    if (plant.output < minCapacity || plant.output > maxCapacity) {
      return false;
    }

    const capacityFactor = plant.capacityFactor;
    if (
      capacityFactor !== null &&
      capacityFactor !== undefined &&
      (capacityFactor < minCapacityFactor || capacityFactor > maxCapacityFactor)
    ) {
      return false;
    }

    return true;
  });
};

export const paginatePowerPlants = (
  plants: PowerPlant[],
  pagination: Pagination
): PowerPlantPage => {
  const { limit, offset } = pagination;
  const total = plants.length;
  const data = plants.slice(offset, offset + limit);

  return {
    data,
    page: {
      limit,
      offset,
      total,
      hasMore: offset + data.length < total,
    },
  };
};

export const getPowerPlantMetadata = (plants: PowerPlant[]): PowerPlantMetadata => {
  const sourceCounts: Record<string, number> = {};
  const statusSet = new Set<string>();
  const countryCounts = new Map<string, { count: number; usedCapacity: number }>();

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const plant of plants) {
    sourceCounts[plant.source] = (sourceCounts[plant.source] || 0) + 1;

    const status = getPlantStatus(plant);
    statusSet.add(status);

    const existing = countryCounts.get(plant.country) || { count: 0, usedCapacity: 0 };
    existing.count += 1;

    const usedCapacity = toSafeNumber(plant.usedCapacity);
    if (usedCapacity !== null && plant.country !== 'CA') {
      existing.usedCapacity += usedCapacity;
    }

    countryCounts.set(plant.country, existing);

    min = Math.min(min, plant.output);
    max = Math.max(max, plant.output);
  }

  const countries: CountryMetadata[] = Array.from(countryCounts.entries())
    .map(([code, value]) => ({
      code,
      count: value.count,
      usedCapacity: value.usedCapacity > 0 ? Number(value.usedCapacity.toFixed(1)) : undefined,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: plants.length,
    sources: Object.keys(sourceCounts).sort(),
    sourceCounts,
    countries,
    statuses: Array.from(statusSet).sort(),
    powerRange: {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    },
  };
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const getSingleQueryValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const parseCsvQueryParam = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
};

export const parseBboxParam = (value: string | undefined): [number, number, number, number] | null => {
  if (!value) return null;

  const parts = value.split(',').map((item) => Number(item.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
};

export const parsePlantQuery = (query: Record<string, string | string[] | undefined>): {
  filters: PlantFilters;
  pagination: Pagination;
  error?: string;
} => {
  const bbox = parseBboxParam(getSingleQueryValue(query.bbox));
  if (getSingleQueryValue(query.bbox) && !bbox) {
    return {
      filters: {},
      pagination: { limit: 5000, offset: 0 },
      error: 'Invalid bbox query parameter. Expected format: minLon,minLat,maxLon,maxLat',
    };
  }

  const minCapacity = toNumber(getSingleQueryValue(query.minCapacity));
  const maxCapacity = toNumber(getSingleQueryValue(query.maxCapacity));
  const minCapacityFactor = toNumber(getSingleQueryValue(query.minCapacityFactor));
  const maxCapacityFactor = toNumber(getSingleQueryValue(query.maxCapacityFactor));

  const limitRaw = toNumber(getSingleQueryValue(query.limit));
  const offsetRaw = toNumber(getSingleQueryValue(query.offset));

  const limit = clamp(limitRaw ?? 5000, 1, 10000);
  const offset = Math.max(0, Math.floor(offsetRaw ?? 0));

  const filters: PlantFilters = {
    bbox: bbox ?? undefined,
    sources: parseCsvQueryParam(getSingleQueryValue(query.sources)),
    countries: parseCsvQueryParam(getSingleQueryValue(query.countries)),
    statuses: parseCsvQueryParam(getSingleQueryValue(query.statuses)),
    minCapacity,
    maxCapacity,
    minCapacityFactor,
    maxCapacityFactor,
  };

  return {
    filters,
    pagination: {
      limit: Math.floor(limit),
      offset,
    },
  };
};
