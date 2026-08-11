export type AIDataCenterStatus =
  | 'Operational'
  | 'Under construction'
  | 'Planned'
  | 'Proposed'
  | 'Cancelled'
  | 'Unknown';

export type AIDataCenterSource = {
  label?: string;
  url: string;
};

export type NearestPowerPlant = {
  id: string;
  name: string;
  distanceMiles: number;
  source?: string;
  outputDisplay?: string;
  country?: string;
  coordinates?: [number, number];
};

export interface AIDataCenter {
  id: string;
  originalId?: string;
  name: string;
  developer?: string;
  operator?: string | null;
  status: AIDataCenterStatus;
  rawStatus?: string;
  dataCenterType?: string;
  stages?: string[];
  coordinates: [number, number]; // [longitude, latitude]
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  powerMw?: number;
  squareFeet?: number;
  siteSizeRaw?: string;
  sizeUnits?: string;
  acreage?: number;
  capitalExpenditure?: number;
  capitalExpenditureRaw?: string;
  operatingDate?: string;
  operatingYear?: number;
  estimatedDailyElectricityUse?: number;
  estimatedDailyWaterUse?: number;
  estimatedHomesEquivalent?: number;
  citationCount?: number;
  sources?: AIDataCenterSource[];
  nearbyPowerPlantCount?: number;
  nearestPowerPlant?: NearestPowerPlant;
  sourceEndpoint?: string;
  retrievedAtUtc?: string;
  sourceType: 'ai-data-center-workbook';
}

export type AIDataCenterFeature = {
  type: 'Feature';
  id?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Partial<Omit<AIDataCenter, 'coordinates'>>;
};

export type AIDataCenterFeatureCollection = {
  type: 'FeatureCollection';
  metadata?: {
    featureCount?: number;
    recordCount?: number;
    invalidCoordinateCount?: number;
    statusCounts?: Record<string, number>;
    [key: string]: unknown;
  };
  features: AIDataCenterFeature[];
};
