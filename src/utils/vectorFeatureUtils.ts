import type { FiberCable } from '../models/FiberCable';
import type { HoveredHifldLine } from '../types/vectorFeatures';
import type { VectorFiberProperties, VectorHifldProperties } from '../types/powerPlantApi';

export type GeometryCoordinates =
  | [number, number][]
  | [number, number][][]
  | [number, number][][][];

export type GeoJsonLikeFeature = {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: GeometryCoordinates;
  };
};

const flattenToSinglePath = (geometry: GeoJsonLikeFeature['geometry']): [number, number][] => {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === 'LineString') {
    return geometry.coordinates as [number, number][];
  }

  if (geometry.type === 'MultiLineString') {
    const multi = geometry.coordinates as [number, number][][];
    return multi[0] || [];
  }

  return [];
};

export const featureToFiberCable = (
  feature: GeoJsonLikeFeature,
  fallbackId: string
): FiberCable | null => {
  const path = flattenToSinglePath(feature.geometry);
  if (path.length === 0) return null;

  const properties = (feature.properties || {}) as VectorFiberProperties;
  const id = String(feature.id ?? properties.LOC_ID ?? properties.NAME ?? fallbackId);

  return {
    id,
    path,
    properties,
  };
};

export const featureToHifldLine = (
  feature: GeoJsonLikeFeature,
  fallbackId: string
): HoveredHifldLine | null => {
  const coordinates = flattenToSinglePath(feature.geometry);
  if (coordinates.length === 0) return null;

  const properties = (feature.properties || {}) as VectorHifldProperties;
  const id = String(feature.id ?? properties.id ?? properties.ID ?? fallbackId);

  return {
    id,
    coordinates,
    properties,
  };
};

export const extractFiberCablesFromViewport = (tiles: unknown[]): FiberCable[] => {
  const cables: FiberCable[] = [];
  const dedupe = new Set<string>();

  for (const tile of tiles) {
    const data = (tile as { data?: unknown })?.data;
    if (!Array.isArray(data)) continue;

    for (let i = 0; i < data.length; i++) {
      const cable = featureToFiberCable(data[i] as GeoJsonLikeFeature, `fiber-${i}`);
      if (!cable) continue;
      if (dedupe.has(cable.id)) continue;
      dedupe.add(cable.id);
      cables.push(cable);
    }
  }

  return cables;
};
