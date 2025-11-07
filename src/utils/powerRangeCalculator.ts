import type { PowerPlant } from '../models/PowerPlant';

export interface PowerRange {
  min: number;
  max: number;
}

/**
 * Calculate the actual min/max power output range from power plant data
 * Adds 200 MW buffer to the maximum for better user experience
 */
export function calculatePowerRange(powerPlants: PowerPlant[]): PowerRange {
  if (powerPlants.length === 0) {
    // Fallback to reasonable defaults if no data
    return { min: 0, max: 10000 };
  }

  // Filter out plants with invalid or zero output
  const validOutputs = powerPlants
    .map(plant => plant.output)
    .filter(output => output > 0 && !isNaN(output));

  if (validOutputs.length === 0) {
    return { min: 0, max: 10000 };
  }

  const min = Math.min(...validOutputs);
  const calculatedMax = Math.max(...validOutputs) + 200; // Add 200 MW buffer
  
  // Cap the maximum at 7000 MW as per user requirement
  const max = Math.min(calculatedMax, 7000);

  // Ensure minimum is not negative and maximum is reasonable
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.ceil(max);

  return {
    min: safeMin,
    max: safeMax
  };
}

/**
 * Get human-readable range description
 */
export function getPowerRangeDescription(range: PowerRange): string {
  return `${range.min.toLocaleString()} - ${range.max.toLocaleString()} MW`;
}

/**
 * Validate if a value is within the calculated range
 */
export function isWithinPowerRange(value: number, range: PowerRange): boolean {
  return value >= range.min && value <= range.max;
}