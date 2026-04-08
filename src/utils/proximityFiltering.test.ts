import { isPointNearLine } from './geoUtils';

describe('proximityFiltering', () => {
  it('should correctly identify power plants near terrestrial links', () => {
    // Create a simple terrestrial link (straight horizontal line)
    const terrestrialLink: [number, number][] = [
      [-74.005974, 40.712776], // Near New York City
      [-73.005974, 40.712776]  // 1 degree east
    ];
    
    // Power plant very close to the start of the terrestrial link (within 10 miles)
    const nearbyPlantStart: [number, number] = [-74.005974, 40.712776];
    
    // Power plant very close to the end of the terrestrial link (within 10 miles)
    const nearbyPlantEnd: [number, number] = [-73.005974, 40.712776];
    
    // Power plant far from the terrestrial link (more than 10 miles from any point)
    const distantPlant: [number, number] = [-118.243683, 34.052235]; // Los Angeles
    
    // With a 10-mile distance threshold, the nearby plants should be identified as near
    const resultNearbyStart = isPointNearLine(nearbyPlantStart, terrestrialLink, 10);
    expect(resultNearbyStart).toBe(true);
    
    const resultNearbyEnd = isPointNearLine(nearbyPlantEnd, terrestrialLink, 10);
    expect(resultNearbyEnd).toBe(true);
    
    // With a 10-mile distance threshold, the distant plant should not be identified as near
    const resultDistant = isPointNearLine(distantPlant, terrestrialLink, 10);
    expect(resultDistant).toBe(false);
  });
  
  it('should handle multiple segments in a terrestrial link', () => {
    // Create a terrestrial link with multiple segments
    const terrestrialLink: [number, number][] = [
      [-74.005974, 40.712776], // Segment 1 start
      [-73.505974, 40.712776], // Segment 1 end / Segment 2 start
      [-73.005974, 40.712776]  // Segment 2 end
    ];
    
    // Power plant near the middle point (which is an endpoint of both segments)
    const plantNearMiddle: [number, number] = [-73.505974, 40.712776];
    
    // With a 10-mile distance threshold, the plant should be identified as near
    const result = isPointNearLine(plantNearMiddle, terrestrialLink, 10);
    expect(result).toBe(true);
  });
});