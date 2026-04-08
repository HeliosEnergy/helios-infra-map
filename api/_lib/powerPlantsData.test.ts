import { describe, expect, it } from 'vitest';
import {
  applyPlantFilters,
  getPowerPlantMetadata,
  paginatePowerPlants,
  parsePlantQuery,
  type PlantFilters,
} from './powerPlantsData';

type TestPlant = {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number];
  country: string;
  capacityFactor?: number | null;
  rawData?: Record<string, string>;
};

const plants: TestPlant[] = [
  {
    id: '1',
    name: 'Alpha',
    output: 100,
    outputDisplay: '100 MW',
    source: 'solar',
    coordinates: [-100, 40],
    country: 'US',
    capacityFactor: 35,
    rawData: { statusDescription: 'Operating' },
  },
  {
    id: '2',
    name: 'Beta',
    output: 500,
    outputDisplay: '500 MW',
    source: 'gas',
    coordinates: [-80, 30],
    country: 'CA',
    capacityFactor: 60,
    rawData: { statusDescription: 'Operating' },
  },
  {
    id: '3',
    name: 'Gamma',
    output: 50,
    outputDisplay: '50 MW',
    source: 'wind',
    coordinates: [10, 10],
    country: 'AE',
    capacityFactor: 20,
    rawData: { statusDescription: 'Retired' },
  },
];

describe('powerPlantsData helpers', () => {
  it('applies combined filters correctly', () => {
    const filters: PlantFilters = {
      bbox: [-120, 20, -70, 50],
      sources: ['solar', 'gas'],
      countries: ['US'],
      statuses: ['Operating'],
      minCapacity: 80,
      maxCapacity: 120,
      minCapacityFactor: 20,
      maxCapacityFactor: 40,
    };

    const filtered = applyPlantFilters(plants as never, filters);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('returns correct page metadata', () => {
    const page = paginatePowerPlants(plants as never, { limit: 2, offset: 1 });

    expect(page.data).toHaveLength(2);
    expect(page.page.total).toBe(3);
    expect(page.page.hasMore).toBe(false);
  });

  it('builds metadata with source and country counts', () => {
    const metadata = getPowerPlantMetadata(plants as never);

    expect(metadata.total).toBe(3);
    expect(metadata.sourceCounts.solar).toBe(1);
    expect(metadata.sourceCounts.gas).toBe(1);
    expect(metadata.statuses).toContain('Operating');
    expect(metadata.countries.find((c) => c.code === 'US')?.count).toBe(1);
  });

  it('parses query params and rejects invalid bbox', () => {
    const invalid = parsePlantQuery({ bbox: '10,20,5,30' });
    expect(invalid.error).toBeTruthy();

    const valid = parsePlantQuery({
      bbox: '-120,20,-70,50',
      sources: 'solar,gas',
      limit: '6000',
      offset: '5',
    });

    expect(valid.error).toBeUndefined();
    expect(valid.filters.sources).toEqual(['solar', 'gas']);
    expect(valid.pagination.limit).toBe(6000);
    expect(valid.pagination.offset).toBe(5);
  });
});
