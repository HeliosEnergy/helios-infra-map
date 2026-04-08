import type { Cable } from '../models/Cable';
import type { TerrestrialLink } from '../models/TerrestrialLink';

interface GeoJsonFeature {
  type: string;
  properties: {
    id?: string;
    name?: string;
    [key: string]: string | undefined;
  };
  geometry: {
    type: string;
    coordinates: [number, number][] | [number, number][][]; // LineString or MultiLineString
  };
}

export interface GeoJsonObject {
  type: string;
  features: GeoJsonFeature[];
}

/**
 * Parse GeoJSON data into Cable and TerrestrialLink objects
 * @param geoJsonData GeoJSON data as object
 * @returns Object containing arrays of Cable and TerrestrialLink objects
 */
export function parseInfrastructureGeoJSON(geoJsonData: GeoJsonObject): { 
  cables: Cable[]; 
  terrestrialLinks: TerrestrialLink[] 
} {
  const cables: Cable[] = [];
  const terrestrialLinks: TerrestrialLink[] = [];
  
  geoJsonData.features.forEach((feature, index) => {
    const id = feature.properties.id || `feature-${index}`;
    const name = feature.properties.name || 'Unnamed Feature';
    
    // Handle different geometry types
    if (feature.geometry.type === 'LineString') {
      const coordinates = feature.geometry.coordinates as [number, number][];
      
      // For now, we'll treat all LineStrings as terrestrial links
      // In a real application, you might differentiate based on properties
      terrestrialLinks.push({
        id,
        name,
        coordinates
      });
    } else if (feature.geometry.type === 'MultiLineString') {
      // Handle MultiLineString by creating separate features for each line
      const coordinatesArray = feature.geometry.coordinates as [number, number][][];
      
      coordinatesArray.forEach((coords, subIndex) => {
        const subId = `${id}-${subIndex}`;
        const subName = `${name} (${subIndex + 1})`;
        
        // Treat MultiLineStrings as cables
        cables.push({
          id: subId,
          name: subName,
          coordinates: coords
        });
      });
    }
  });
  
  return { cables, terrestrialLinks };
}

/**
 * Process ITU WFS GeoJSON data into Cable objects
 * @param geoJsonData ITU WFS GeoJSON data as object
 * @returns Array of Cable objects
 */
export function processWfsCableData(geoJsonData: GeoJsonObject): Cable[] {
  const cables: Cable[] = [];
  
  if (!geoJsonData || !geoJsonData.features) {
    return cables;
  }
  
  geoJsonData.features.forEach((feature, index) => {
    if (feature.geometry?.type === 'LineString') {
      const props = feature.properties || {};
      const coordinates = feature.geometry.coordinates as [number, number][];
      
      const cable: Cable = {
        id: props.id || `cable_${index}`,
        name: props.name || props.cable_name || `Cable ${index}`,
        coordinates: coordinates
      };
      
      cables.push(cable);
    }
  });
  
  return cables;
}