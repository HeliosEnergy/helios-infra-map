import { isPointNearLine } from './geoUtils';

describe('filtering', () => {
  it('should correctly identify points near a line', () => {
    // Create a simple line (straight horizontal line)
    const line: [number, number][] = [
      [-74.005974, 40.712776], // Near New York City
      [-73.005974, 40.712776]  // 1 degree east
    ];
    
    // Point very close to the line
    const pointNear: [number, number] = [-73.505974, 40.712776];
    
    // Point far from the line
    const pointFar: [number, number] = [-118.243683, 34.052235]; // Los Angeles
    
    // With a large enough distance threshold (100 miles), the near point should be true
    const resultNear = isPointNearLine(pointNear, line, 100);
    expect(resultNear).toBe(true);
    
    // With a small distance threshold (10 miles), the far point should be false
    const resultFar = isPointNearLine(pointFar, line, 10);
    expect(resultFar).toBe(false);
  });
});