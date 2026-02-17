import type { PowerPlant } from '../models/PowerPlant';

export interface PowerPlantPage {
  data: PowerPlant[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface CountryMetadata {
  code: string;
  count: number;
  usedCapacity?: number;
}

export interface PowerPlantMetadata {
  total: number;
  sources: string[];
  sourceCounts: Record<string, number>;
  countries: CountryMetadata[];
  statuses: string[];
  powerRange: {
    min: number;
    max: number;
  };
}

export interface PowerPlantQuery {
  bbox?: [number, number, number, number];
  sources?: string[];
  countries?: string[];
  statuses?: string[];
  minCapacity?: number;
  maxCapacity?: number;
  minCapacityFactor?: number;
  maxCapacityFactor?: number;
  limit?: number;
  offset?: number;
}

export interface VectorFiberProperties {
  NAME?: string;
  OPERATOR?: string;
  OWNER?: string;
  TYPE?: string;
  STATUS?: string;
  SERVICE_TYPE?: string;
  MILES?: number;
  STATE_NAME?: string;
  CNTY_NAME?: string;
  CNTRY_NAME?: string;
  QUALITY?: string;
  LOC_ID?: string;
  [key: string]: unknown;
}

export interface VectorHifldProperties {
  id?: string;
  ID?: string;
  objectId?: number;
  OBJECTID?: number;
  owner?: string;
  OWNER?: string;
  voltage?: number;
  VOLTAGE?: number;
  voltClass?: string;
  VOLT_CLASS?: string;
  status?: string;
  STATUS?: string;
  type?: string;
  TYPE?: string;
  sub1?: string;
  SUB_1?: string;
  sub2?: string;
  SUB_2?: string;
  shapeLength?: number;
  [key: string]: unknown;
}
