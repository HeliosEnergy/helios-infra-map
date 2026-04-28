import { useMemo } from 'react';
import type RBush from 'rbush';
import type { PowerPlant } from '../models/PowerPlant';
import type { LineSegment } from '../utils/spatialIndex';
import { isPointNearLine } from '../utils/geoUtils';
import { queryLineIndex } from '../utils/spatialIndex';

export type ProximityAnalysisParams = {
  powerPlants: PowerPlant[];
  showOnlyNearbyPlants: boolean;
  lineIndex: RBush<LineSegment> | null;
  proximityDistance: number;
};

export function useProximityAnalysis({
  powerPlants,
  showOnlyNearbyPlants,
  lineIndex,
  proximityDistance,
}: ProximityAnalysisParams) {
  return useMemo(() => {
    const filteredPowerPlants: PowerPlant[] = [];
    const nearbyPlants: PowerPlant[] = [];

    for (const plant of powerPlants) {
      if (!showOnlyNearbyPlants || !lineIndex) {
        filteredPowerPlants.push(plant);
        continue;
      }

      const nearbySegments = queryLineIndex(lineIndex, plant.coordinates, proximityDistance);
      let isNearby = false;
      for (const segment of nearbySegments) {
        if (isPointNearLine(plant.coordinates, segment, proximityDistance)) {
          isNearby = true;
          break;
        }
      }

      if (isNearby) {
        filteredPowerPlants.push(plant);
        nearbyPlants.push(plant);
      }
    }

    return {
      filteredPowerPlants,
      nearbyPlants,
      proximityPlantCount: nearbyPlants.length,
    };
  }, [powerPlants, showOnlyNearbyPlants, lineIndex, proximityDistance]);
}
