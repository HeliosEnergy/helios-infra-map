import type { PowerPlant } from '../models/PowerPlant';
import type { Cable } from '../models/Cable';
import type { TerrestrialLink } from '../models/TerrestrialLink';
import { parsePowerPlantCSV } from './csvParser';
import { parseInfrastructureGeoJSON } from './geoJsonParser';

/**
 * Load power plant data from CSV file
 * @param csvFilePath Path to CSV file
 * @returns Promise resolving to array of PowerPlant objects
 */
export async function loadPowerPlantData(csvFilePath: string): Promise<PowerPlant[]> {
  try {
    const response = await fetch(csvFilePath);
    if (!response.ok) {
      throw new Error(`Failed to load power plant data: ${response.statusText}`);
    }
    const csvText = await response.text();
    return parsePowerPlantCSV(csvText);
  } catch (error) {
    console.error('Error loading power plant data:', error);
    return [];
  }
}

/**
 * Load infrastructure data from GeoJSON file
 * @param geoJsonFilePath Path to GeoJSON file
 * @returns Promise resolving to object containing cables and terrestrial links
 */
export async function loadInfrastructureData(geoJsonFilePath: string): Promise<{
  cables: Cable[];
  terrestrialLinks: TerrestrialLink[];
}> {
  try {
    // Use BASE_URL to ensure correct path resolution in both development and production
    const fullPath = `${import.meta.env.BASE_URL}${geoJsonFilePath.startsWith('/') ? geoJsonFilePath.slice(1) : geoJsonFilePath}`;
    const response = await fetch(fullPath);
    if (!response.ok) {
      throw new Error(`Failed to load infrastructure data: ${response.statusText}`);
    }
    const geoJsonData = await response.json();
    return parseInfrastructureGeoJSON(geoJsonData);
  } catch (error) {
    console.error('Error loading infrastructure data:', error);
    return { cables: [], terrestrialLinks: [] };
  }
}