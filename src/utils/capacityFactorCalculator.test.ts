import { calculateCapacityFactors, exportToJSON, exportToCSV } from './capacityFactorCalculator';

// Mock EIA data for testing
const mockEIAData = {
  response: {
    data: [
      {
        period: '2024-12',
        plantid: '55409',
        plantName: 'Calhoun Energy Center',
        generatorid: 'CAL1',
        'nameplate-capacity-mw': '187',
        'net-summer-capacity-mw': '176',
        'net-winter-capacity-mw': '195',
        'historical_avg_generation_mw': '150'
      },
      {
        period: '2024-12',
        plantid: '55409',
        plantName: 'Calhoun Energy Center',
        generatorid: 'CAL2',
        'nameplate-capacity-mw': '100',
        'net-summer-capacity-mw': '95',
        'net-winter-capacity-mw': '105',
        'historical_avg_generation_mw': '80'
      },
      {
        period: '2024-12',
        plantid: '12345',
        plantName: 'Test Plant',
        generatorid: 'GEN1',
        'nameplate-capacity-mw': '50',
        'net-summer-capacity-mw': '45',
        'net-winter-capacity-mw': '55',
        'historical_avg_generation_mw': '40'
      }
    ]
  }
};

describe('Capacity Factor Calculator', () => {
  test('calculates capacity factors for plant data', () => {
    const results = calculateCapacityFactors(mockEIAData);

    expect(results).toHaveLength(2); // Two unique plants

    // Check Calhoun Energy Center (aggregated)
    const calhoun = results.find(r => r.plant_id === '55409');
    expect(calhoun).toBeDefined();
    expect(calhoun!.plant_name).toBe('Calhoun Energy Center');
    expect(calhoun!.capacity_mw).toBe(287); // 187 + 100
    expect(calhoun!.capacity_factor).toBeCloseTo(80.1, 1); // (150+80)/287 ≈ 0.801 * 100
    expect(calhoun!.data_quality).toBe('complete');
    expect(calhoun!.net_summer_capacity_mw).toBe(271); // 176 + 95
    expect(calhoun!.net_winter_capacity_mw).toBe(300); // 195 + 105
    expect(calhoun!.generators_count).toBe(2);

    // Check Test Plant
    const testPlant = results.find(r => r.plant_id === '12345');
    expect(testPlant).toBeDefined();
    expect(testPlant!.capacity_mw).toBe(50);
    expect(testPlant!.capacity_factor).toBe(80); // 40/50 * 100
    expect(testPlant!.data_quality).toBe('complete');
    expect(testPlant!.generators_count).toBe(1);
  });

  test('handles invalid capacity data', () => {
    const invalidData = {
      response: {
        data: [
          {
            period: '2024-12',
            plantid: '99999',
            plantName: 'Invalid Plant',
            generatorid: 'INV1',
            'nameplate-capacity-mw': '0', // Invalid capacity
            'net-summer-capacity-mw': '0',
            'net-winter-capacity-mw': '0',
            'historical_avg_generation_mw': '10'
          }
        ]
      }
    };

    const results = calculateCapacityFactors(invalidData);
    expect(results[0].data_quality).toBe('invalid_data');
    expect(results[0].capacity_factor).toBeNull();
  });

  test('exports to JSON format', () => {
    const results = calculateCapacityFactors(mockEIAData);
    const jsonOutput = exportToJSON(results);

    expect(() => JSON.parse(jsonOutput)).not.toThrow();
    const parsed = JSON.parse(jsonOutput);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });

  test('exports to CSV format', () => {
    const results = calculateCapacityFactors(mockEIAData);
    const csvOutput = exportToCSV(results);

    const lines = csvOutput.split('\n');
    expect(lines.length).toBe(3); // Header + 2 data rows
    expect(lines[0]).toContain('plant_id,plant_name,capacity_mw');
  });
});