import type { PowerPlant } from '../models/PowerPlant';

/**
 * Parse CSV string into PowerPlant objects
 * @param csvData CSV data as string
 * @returns Array of PowerPlant objects
 */
export function parsePowerPlantCSV(csvData: string): PowerPlant[] {
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map((line, index) => {
    const values = line.split(',');
    const entry: Record<string, string> = {};

    headers.forEach((header, i) => {
      entry[header.trim()] = values[i]?.trim() || '';
    });
    
    // Convert coordinates to tuple
    const coords = entry.coordinates.split(';').map(Number) as [number, number];
    
    return {
      id: entry.id || `plant-${index}`,
      name: entry.name || 'Unknown Plant',
      output: Number(entry.output) || 0,
      outputDisplay: entry.outputDisplay || `${entry.output} MW`,
      source: entry.source || 'Other',
      coordinates: coords,
      country: 'US' as const
    };
  });
}