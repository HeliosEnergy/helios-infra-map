/**
 * Calculate bounding box (bbox) from map viewState
 * @param longitude - Center longitude
 * @param latitude - Center latitude
 * @param zoom - Zoom level
 * @param width - Map width in pixels (default: window width)
 * @param height - Map height in pixels (default: window height)
 * @param padding - Padding factor (default: 1.2 = 20% padding to ensure edges are covered)
 * @returns Bounding box [minLon, minLat, maxLon, maxLat]
 */
export function calculateBbox(
  longitude: number,
  latitude: number,
  zoom: number,
  width: number = typeof window !== 'undefined' ? window.innerWidth : 1000,
  height: number = typeof window !== 'undefined' ? window.innerHeight : 800,
  padding: number = 1.2
): [number, number, number, number] {
  // At zoom level z, 360 degrees = 256 * 2^z pixels
  const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));

  // Adjust for latitude (longitude degrees are smaller at higher latitudes)
  const latRad = (latitude * Math.PI) / 180;
  const adjustedDegreesPerPixelLon = degreesPerPixel / Math.cos(latRad);

  // Calculate half-widths in degrees
  const halfWidthDegrees = (width / 2) * adjustedDegreesPerPixelLon * padding;
  const halfHeightDegrees = (height / 2) * degreesPerPixel * padding;

  // Calculate bbox
  const minLon = longitude - halfWidthDegrees;
  const maxLon = longitude + halfWidthDegrees;
  const minLat = latitude - halfHeightDegrees;
  const maxLat = latitude + halfHeightDegrees;

  // Clamp to valid ranges
  return [
    Math.max(-180, Math.min(180, minLon)),
    Math.max(-90, Math.min(90, minLat)),
    Math.max(-180, Math.min(180, maxLon)),
    Math.max(-90, Math.min(90, maxLat)),
  ];
}
