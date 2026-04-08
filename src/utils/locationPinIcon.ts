/**
 * Creates a location pin icon as a data URL
 * Returns an SVG pin icon that looks like Google Maps style
 */
export function createLocationPinIcon(): string {
  const svg = `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 16 24 16 24s16-12.5 16-24C32 7.163 24.837 0 16 0z" fill="#dc2626"/>
      <circle cx="16" cy="16" r="6" fill="#ffffff"/>
    </svg>
  `.trim();
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Icon mapping for IconLayer
 */
export const LOCATION_PIN_ICON = {
  url: createLocationPinIcon(),
  width: 32,
  height: 40,
  anchorY: 40, // Pin point is at the bottom
};
