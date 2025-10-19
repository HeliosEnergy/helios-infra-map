import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAndProcessAllPowerPlants, parsePowerPlantCSV, aggregatePowerPlants } from './unifiedPowerPlantProcessor';
import type { PowerPlant } from '../models/PowerPlant';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('unifiedPowerPlantProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadAndProcessAllPowerPlants', () => {
    it('should load and process power plant data from both CSV files', async () => {
      // Mock CSV data
      const mockLargePlantsCSV = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Energy Source"
"Plant A","Canada",45.0,-75.0,150.5,"Hydroelectric"
"Plant B","United States",40.0,-100.0,200.0,"Natural Gas"`;

      const mockRenewablePlantsCSV = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Renewable Energy Source"
"Plant C","Canada",50.0,-80.0,50.0,"Wind"
"Plant D","United States",35.0,-110.0,75.5,"Solar"`;

      const mockKazakhstanPlantsCSV = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Energy Source"
"Plant E","Kazakhstan",43.0,68.0,125.0,"Coal"`;

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('Power_Plants,_100_MW_or_more.csv')) {
          return Promise.resolve({
            text: () => Promise.resolve(mockLargePlantsCSV),
          });
        } else if (url.includes('Renewable_Energy_Power_Plants,_1_MW_or_more.csv')) {
          return Promise.resolve({
            text: () => Promise.resolve(mockRenewablePlantsCSV),
          });
        } else if (url.includes('Kazakhstan_Power_Plants.csv')) {
          return Promise.resolve({
            text: () => Promise.resolve(mockKazakhstanPlantsCSV),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await loadAndProcessAllPowerPlants();

      // Only expecting 4 plants since US plants from large/renewable CSVs are filtered out
      // and only Canada and Kazakhstan plants are included from those files
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Plant A');
      expect(result[0].country).toBe('CA');
      expect(result[0].source).toBe('hydro');
      expect(result[0].output).toBe(150.5);
      expect(result[1].name).toBe('Plant C');
      expect(result[1].country).toBe('CA');
      expect(result[1].source).toBe('wind');
      expect(result[2].name).toBe('Plant E');
      expect(result[2].country).toBe('KZ');
      expect(result[2].source).toBe('coal');
      expect(result[2].output).toBe(125.0);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await loadAndProcessAllPowerPlants();

      expect(result).toEqual([]);
    });
  });

  describe('parsePowerPlantCSV', () => {
    it('should parse large power plant CSV data correctly', () => {
      const csvText = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Energy Source"
"Test Plant","Canada",45.5,-75.5,100.0,"Coal"`;

      const result = parsePowerPlantCSV(csvText, 'large');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Plant');
      expect(result[0].country).toBe('CA');
      expect(result[0].coordinates).toEqual([-75.5, 45.5]);
      expect(result[0].output).toBe(100.0);
      expect(result[0].source).toBe('coal');
      expect(result[0].rawData).toBeDefined();
    });

    it('should parse renewable power plant CSV data correctly', () => {
      const csvText = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Renewable Energy Source"
"Renewable Plant","Canada",40.5,-100.5,50.0,"Wind"`;

      const result = parsePowerPlantCSV(csvText, 'renewable');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Renewable Plant');
      expect(result[0].country).toBe('CA');
      expect(result[0].coordinates).toEqual([-100.5, 40.5]);
      expect(result[0].output).toBe(50.0);
      expect(result[0].source).toBe('wind');
      expect(result[0].rawData).toBeDefined();
    });

    it('should parse Kazakhstan power plant CSV data correctly', () => {
      const csvText = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Energy Source"
"Kazakhstan Plant","Kazakhstan",43.5,69.5,75.0,"Natural Gas"`;

      const result = parsePowerPlantCSV(csvText, 'kazakhstan');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Kazakhstan Plant');
      expect(result[0].country).toBe('KZ');
      expect(result[0].coordinates).toEqual([69.5, 43.5]);
      expect(result[0].output).toBe(75.0);
      expect(result[0].source).toBe('gas');
      expect(result[0].rawData).toBeDefined();
    });

    it('should skip rows with invalid data', () => {
      const csvText = `"Facility Name","Country","Latitude","Longitude","Total Capacity (MW)","Primary Energy Source"
"Valid Plant","Canada",45.0,-75.0,100.0,"Coal"
"Invalid Plant","Canada",invalid,-75.0,100.0,"Coal"
"Zero Output Plant","Canada",45.0,-75.0,0.0,"Coal"`;

      const result = parsePowerPlantCSV(csvText, 'large');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid Plant');
    });
  });

  describe('aggregatePowerPlants', () => {
    it('should aggregate plants with same name, coordinates, and country', () => {
      const plants: PowerPlant[] = [
        {
          id: 'plant-large-1',
          name: 'Test Plant',
          output: 100.0,
          outputDisplay: '100.0 MW',
          source: 'coal',
          coordinates: [-75.5, 45.5],
          country: 'CA',
          rawData: { 'Total Capacity (MW)': '100.0' }
        },
        {
          id: 'plant-large-2',
          name: 'Test Plant',
          output: 50.0,
          outputDisplay: '50.0 MW',
          source: 'coal',
          coordinates: [-75.5, 45.5],
          country: 'CA',
          rawData: { 'Total Capacity (MW)': '50.0' }
        },
        {
          id: 'plant-renewable-1',
          name: 'Different Plant',
          output: 75.0,
          outputDisplay: '75.0 MW',
          source: 'wind',
          coordinates: [-80.0, 50.0],
          country: 'CA',
          rawData: { 'Total Capacity (MW)': '75.0' }
        }
      ];

      const result = aggregatePowerPlants(plants);

      expect(result).toHaveLength(2);
      const aggregatedPlant = result.find(p => p.name === 'Test Plant');
      expect(aggregatedPlant).toBeDefined();
      expect(aggregatedPlant?.output).toBe(150.0);
      expect(aggregatedPlant?.outputDisplay).toBe('150.0 MW');
    });
  });
});