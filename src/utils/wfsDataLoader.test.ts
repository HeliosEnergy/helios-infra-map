import { describe, it, expect } from 'vitest';
import { processWfsCableData, type GeoJsonObject } from './geoJsonParser';

// Mock test data
const mockWfsData: GeoJsonObject = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "test_cable_1",
        "name": "Test Cable 1"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [0, 0],
          [1, 1]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "test_cable_2",
        "name": "Test Cable 2"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [2, 2],
          [3, 3]
        ]
      }
    }
  ]
};

describe('processWfsCableData', () => {
  it('should process ITU GeoJSON data into Cable objects', () => {
    const result = processWfsCableData(mockWfsData);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'test_cable_1',
      name: 'Test Cable 1',
      coordinates: [[0, 0], [1, 1]]
    });
    expect(result[1]).toEqual({
      id: 'test_cable_2',
      name: 'Test Cable 2',
      coordinates: [[2, 2], [3, 3]]
    });
  });

  it('should handle missing properties', () => {
    const testData: GeoJsonObject = {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "properties": {},
          "geometry": {
            "type": "LineString",
            "coordinates": [[0, 0], [1, 1]]
          }
        }
      ]
    };
    
    const result = processWfsCableData(testData);
    
    expect(result).toHaveLength(1);
    expect(result[0].id).toContain('cable_');
    expect(result[0].name).toContain('Cable');
    expect(result[0].coordinates).toEqual([[0, 0], [1, 1]]);
  });

  it('should handle empty or invalid data', () => {
    const result = processWfsCableData(null as unknown as GeoJsonObject);
    expect(result).toEqual([]);

    const result2 = processWfsCableData({} as unknown as GeoJsonObject);
    expect(result2).toEqual([]);
  });
});