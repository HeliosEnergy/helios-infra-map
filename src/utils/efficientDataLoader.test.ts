import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadEIADataEfficiently, transformEIADataToPowerPlants } from './efficientDataLoader';
import { CacheManager } from './cache';
import type { PowerPlant } from '../models/PowerPlant';

// Mock the global fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the CacheManager
vi.mock('./cache', () => {
  return {
    CacheManager: {
      getCachedData: vi.fn(),
      setCachedData: vi.fn(() => true), // Make it return true by default
      isCacheValid: vi.fn(),
      getDecompressedData: vi.fn(),
      clearCache: vi.fn()
    }
  };
});

// Mock the streamingJsonParser
vi.mock('./streamingJsonParser', () => {
  return {
    loadLargeJsonData: vi.fn((url, callback) => {
      // Simulate streaming by calling the callback with mock data
      const mockRawData = [
        {
          plantid: '1',
          generatorid: '1',
          plantName: 'Test Plant',
          latitude: '40.0',
          longitude: '-100.0',
          'nameplate-capacity-mw': '100',
          'net-summer-capacity-mw': '80',
          'net-winter-capacity-mw': '70',
          'energy-source-desc': 'Solar'
        }
      ];
      
      mockRawData.forEach((item, index) => {
        callback(item, index);
      });
      
      return Promise.resolve(mockRawData.length);
    })
  };
});

describe('efficientDataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadEIADataEfficiently', () => {
    it('should load data from cache when available and valid', async () => {
      const mockPlants: PowerPlant[] = [
        {
          id: 'us-1-1',
          name: 'Test Plant',
          output: 100,
          outputDisplay: '100.0 MW',
          source: 'solar',
          coordinates: [-100, 40],
          country: 'US',
          capacityFactor: 80,
          rawData: {}
        }
      ];

      (CacheManager.getCachedData as ReturnType<typeof vi.fn>).mockReturnValue({
        metadata: { timestamp: Date.now(), version: 'v1', size: 100, compressedSize: 50, compressed: true }
      });
      (CacheManager.isCacheValid as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (CacheManager.getDecompressedData as ReturnType<typeof vi.fn>).mockReturnValue(mockPlants);

      const result = await loadEIADataEfficiently();

      expect(result).toEqual(mockPlants);
      expect(CacheManager.getCachedData).toHaveBeenCalledWith('eia-power-plants-v1');
      expect(CacheManager.isCacheValid).toHaveBeenCalled();
      expect(CacheManager.getDecompressedData).toHaveBeenCalledWith('eia-power-plants-v1');
    });

    it('should fetch and process data when cache is not available', async () => {
      (CacheManager.getCachedData as ReturnType<typeof vi.fn>).mockReturnValue(null);
      
      const mockRawData = [
        {
          plantid: '1',
          generatorid: '1',
          plantName: 'Test Plant',
          latitude: '40.0',
          longitude: '-100.0',
          'nameplate-capacity-mw': '100',
          'net-summer-capacity-mw': '80',
          'net-winter-capacity-mw': '70',
          'energy-source-desc': 'Solar'
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRawData)
      });

      // Mock the streaming parser to throw an error so we fall back to regular parsing
      const { loadLargeJsonData } = await import('./streamingJsonParser');
      (loadLargeJsonData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Streaming not supported'));

      const result = await loadEIADataEfficiently();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('us-1-1');
      expect(result[0].name).toBe('Test Plant');
      expect(result[0].source).toBe('solar');
      expect(result[0].coordinates).toEqual([-100, 40]);
      expect(CacheManager.setCachedData).toHaveBeenCalledWith('eia-power-plants-v1', result);
    });

    it('should return empty array on network error', async () => {
      (CacheManager.getCachedData as ReturnType<typeof vi.fn>).mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await loadEIADataEfficiently();

      expect(result).toEqual([]);
    });

    it('should handle invalid data gracefully', async () => {
      (CacheManager.getCachedData as ReturnType<typeof vi.fn>).mockReturnValue(null);
      
      const mockRawData = [
        // Valid entry
        {
          plantid: '1',
          generatorid: '1',
          plantName: 'Valid Plant',
          latitude: '40.0',
          longitude: '-100.0',
          'nameplate-capacity-mw': '100',
          'net-summer-capacity-mw': '80',
          'net-winter-capacity-mw': '70',
          'energy-source-desc': 'Solar'
        },
        // Invalid entry with missing coordinates
        {
          plantid: '2',
          generatorid: '1',
          plantName: 'Invalid Plant',
          latitude: 'invalid',
          longitude: '-100.0',
          'nameplate-capacity-mw': '100',
          'net-summer-capacity-mw': '80',
          'net-winter-capacity-mw': '70',
          'energy-source-desc': 'Solar'
        },
        // Invalid entry with zero capacity
        {
          plantid: '3',
          generatorid: '1',
          plantName: 'Zero Capacity Plant',
          latitude: '40.0',
          longitude: '-100.0',
          'nameplate-capacity-mw': '0',
          'net-summer-capacity-mw': '0',
          'net-winter-capacity-mw': '0',
          'energy-source-desc': 'Solar'
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRawData)
      });

      // Mock the streaming parser to throw an error so we fall back to regular parsing
      const { loadLargeJsonData } = await import('./streamingJsonParser');
      (loadLargeJsonData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Streaming not supported'));

      const result = await loadEIADataEfficiently();

      // Should only include the valid plant
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid Plant');
    });
  });

  describe('transformEIADataToPowerPlants', () => {
    it('should correctly transform EIA data to PowerPlant objects', () => {
      const rawData = [
        {
          plantid: '123',
          generatorid: '456',
          plantName: 'Test Solar Plant',
          latitude: '35.0',
          longitude: '-110.0',
          'nameplate-capacity-mw': '50.5',
          'net-summer-capacity-mw': '45.0',
          'net-winter-capacity-mw': '42.0',
          'energy-source-desc': 'Solar'
        }
      ];

      const result = transformEIADataToPowerPlants(rawData);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'us-123-456',
        name: 'Test Solar Plant',
        output: 50.5,
        outputDisplay: '50.5 MW',
        source: 'solar',
        coordinates: [-110, 35],
        country: 'US',
        capacityFactor: expect.any(Number),
        netSummerCapacity: 45.0,
        netWinterCapacity: 42.0,
        rawData: rawData[0]
      });
    });

    it('should handle missing optional fields', () => {
      const rawData = [
        {
          plantid: '789',
          generatorid: '012',
          plantName: 'Minimal Plant',
          latitude: '45.0',
          longitude: '-95.0',
          'nameplate-capacity-mw': '100',
          'energy-source-desc': 'Wind'
          // Missing net-summer-capacity-mw and net-winter-capacity-mw
        }
      ];

      const result = transformEIADataToPowerPlants(rawData);

      expect(result).toHaveLength(1);
      expect(result[0].netSummerCapacity).toBeUndefined();
      expect(result[0].netWinterCapacity).toBeUndefined();
    });

    it('should map energy sources correctly', () => {
      const rawData = [
        {
          plantid: '1',
          generatorid: '1',
          plantName: 'Coal Plant',
          latitude: '40.0',
          longitude: '-100.0',
          'nameplate-capacity-mw': '500',
          'energy-source-desc': 'Coal'
        },
        {
          plantid: '2',
          generatorid: '1',
          plantName: 'Natural Gas Plant',
          latitude: '41.0',
          longitude: '-101.0',
          'nameplate-capacity-mw': '300',
          'energy-source-desc': 'Natural Gas'
        },
        {
          plantid: '3',
          generatorid: '1',
          plantName: 'Unknown Plant',
          latitude: '42.0',
          longitude: '-102.0',
          'nameplate-capacity-mw': '75',
          'energy-source-desc': 'Some Unknown Source'
        }
      ];

      const result = transformEIADataToPowerPlants(rawData);

      expect(result).toHaveLength(3);
      expect(result[0].source).toBe('coal');
      expect(result[1].source).toBe('gas');
      expect(result[2].source).toBe('other');
    });
  });
});