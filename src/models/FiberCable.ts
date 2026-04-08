import type { VectorFiberProperties } from '../types/powerPlantApi';

export interface FiberCable {
  id: string;
  path: [number, number][];
  properties: VectorFiberProperties;
}

export interface NearbyFiberCable extends FiberCable {
  distance: number;
}
