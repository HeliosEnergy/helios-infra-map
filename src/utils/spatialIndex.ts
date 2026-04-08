
import RBush from 'rbush';
import type { Cable } from '../models/Cable';
import type { TerrestrialLink } from '../models/TerrestrialLink';

export interface LineSegment {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  segment: [[number, number], [number, number]];
}

// Create a spatial index for lines (cables and terrestrial links)
export function createLineIndex(lines: (Cable | TerrestrialLink)[]) {
  const index = new RBush<LineSegment>();
  
  for (const line of lines) {
    for (let i = 0; i < line.coordinates.length - 1; i++) {
      const start = line.coordinates[i];
      const end = line.coordinates[i + 1];
      
      const minX = Math.min(start[0], end[0]);
      const minY = Math.min(start[1], end[1]);
      const maxX = Math.max(start[0], end[0]);
      const maxY = Math.max(start[1], end[1]);
      
      index.insert({
        minX,
        minY,
        maxX,
        maxY,
        segment: [start, end]
      });
    }
  }
  
  return index;
}

// Query the spatial index to find nearby lines
export function queryLineIndex(
  index: RBush<LineSegment>,
  point: [number, number],
  distance: number
): [[number, number], [number, number]][] {
  const [lon, lat] = point;
  
  // Convert distance from miles to degrees (approximation)
  const distanceInDegrees = distance / 69;
  
  const searchArea = {
    minX: lon - distanceInDegrees,
    minY: lat - distanceInDegrees,
    maxX: lon + distanceInDegrees,
    maxY: lat + distanceInDegrees
  };
  
  const results = index.search(searchArea);
  return results.map(result => result.segment);
}
