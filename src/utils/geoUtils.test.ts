import { calculateDistance, isPointNearLine } from './geoUtils';

describe('geoUtils', () => {
  describe('calculateDistance', () => {
    it('should calculate the distance between two points', () => {
      // Test with known coordinates
      const coord1: [number, number] = [-73.935242, 40.730610]; // New York City
      const coord2: [number, number] = [-118.243683, 34.052235]; // Los Angeles
      
      const distance = calculateDistance(coord1, coord2);
      
      // The distance should be approximately 2445 miles
      expect(distance).toBeCloseTo(2445, -2); // Allow for 100 mile tolerance
    });
    
    it('should return 0 for the same point', () => {
      const coord: [number, number] = [-73.935242, 40.730610];
      
      const distance = calculateDistance(coord, coord);
      
      expect(distance).toBe(0);
    });
  });
  
  describe('isPointNearLine', () => {
    it('should return true when point is near a line', () => {
      // Create a simple line (straight horizontal line)
      const line: [number, number][] = [
        [-74.005974, 40.712776], // Near New York City
        [-73.005974, 40.712776]  // 1 degree east
      ];
      
      // Point very close to the line
      const point: [number, number] = [-73.505974, 40.712776];
      
      // With a large enough distance threshold (100 miles), this should be true
      const result = isPointNearLine(point, line, 100);
      
      expect(result).toBe(true);
    });
    
    it('should return false when point is far from a line', () => {
      // Create a simple line (straight horizontal line)
      const line: [number, number][] = [
        [-74.005974, 40.712776], // Near New York City
        [-73.005974, 40.712776]  // 1 degree east
      ];
      
      // Point far from the line
      const point: [number, number] = [-118.243683, 34.052235]; // Los Angeles
      
      // With a small distance threshold (10 miles), this should be false
      const result = isPointNearLine(point, line, 10);
      
      expect(result).toBe(false);
    });
  });
});