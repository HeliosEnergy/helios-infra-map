import type { FiberCable, NearbyFiberCable } from '../models/FiberCable';

type NearbyFiberRequest = {
  requestId: number;
  plantCoordinates: [number, number];
  cables: FiberCable[];
  radiusMiles: number;
};

type NearbyFiberResponse = {
  requestId: number;
  nearby: NearbyFiberCable[];
};

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const calculateDistance = (a: [number, number], b: [number, number]): number => {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);

  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinHalfLon * sinHalfLon;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
};

const distanceToSegment = (
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
): number => {
  const [x, y] = point;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;

  const a = x - x1;
  const b = y - y1;
  const c = x2 - x1;
  const d = y2 - y1;

  const dot = a * c + b * d;
  const lenSq = c * c + d * d;
  const normalized = lenSq !== 0 ? dot / lenSq : -1;
  const t = Math.max(0, Math.min(1, normalized));

  const projected: [number, number] = [x1 + t * c, y1 + t * d];
  return calculateDistance(point, projected);
};

const isPointNearLine = (
  point: [number, number],
  line: [number, number][],
  radiusMiles: number
): boolean => {
  if (line.length === 0) return false;
  if (line.length === 1) return calculateDistance(point, line[0]) <= radiusMiles;

  for (let i = 0; i < line.length - 1; i++) {
    if (distanceToSegment(point, line[i], line[i + 1]) <= radiusMiles) {
      return true;
    }
  }

  return false;
};

self.addEventListener('message', (event: MessageEvent<NearbyFiberRequest>) => {
  const { requestId, plantCoordinates, cables, radiusMiles } = event.data;

  const nearby: NearbyFiberCable[] = [];

  for (const cable of cables) {
    if (!cable.path || cable.path.length === 0) continue;

    if (!isPointNearLine(plantCoordinates, cable.path, radiusMiles)) {
      continue;
    }

    let minDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < cable.path.length - 1; i++) {
      const segmentDistance = distanceToSegment(plantCoordinates, cable.path[i], cable.path[i + 1]);
      minDistance = Math.min(minDistance, segmentDistance);
    }

    for (const point of cable.path) {
      minDistance = Math.min(minDistance, calculateDistance(plantCoordinates, point));
    }

    nearby.push({
      ...cable,
      distance: Number.isFinite(minDistance) ? minDistance : 0,
    });
  }

  nearby.sort((a, b) => a.distance - b.distance);

  const response: NearbyFiberResponse = {
    requestId,
    nearby,
  };

  self.postMessage(response);
});

export {};
