import type { FiberCable } from '../models/FiberCable';
import type { VectorHifldProperties } from './powerPlantApi';

export interface HoveredHifldLine {
  id: string;
  coordinates: [number, number][];
  properties: VectorHifldProperties;
}

export type HoveredFiberCable = FiberCable;
