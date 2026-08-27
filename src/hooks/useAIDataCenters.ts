import { useEffect, useMemo, useState } from 'react';
import type { AIDataCenter, AIDataCenterFeatureCollection } from '../models/AIDataCenter';
import { authenticatedFetch } from '../utils/auth';

type UseAIDataCentersParams = {
  enabled: boolean;
  nearPowerPlantsEnabled?: boolean;
  nearPowerPlantsRadiusMiles?: number;
  powerPlantSectorFilter?: 'all' | 'independent' | 'electric_utility' | 'commercial' | 'other';
  filteredSources?: ReadonlySet<string>;
  enabledCountries?: ReadonlySet<string>;
  filteredStatuses?: ReadonlySet<string>;
  minPowerOutput?: number;
  maxPowerOutput?: number;
  minCapacityFactor?: number;
  maxCapacityFactor?: number;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toSortedCsv = (values?: ReadonlySet<string>) => {
  if (!values || values.size === 0) return null;
  return Array.from(values).sort().join(',');
};

const appendNumberParam = (params: URLSearchParams, key: string, value: number | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    params.set(key, String(value));
  }
};

const toAIDataCenter = (feature: AIDataCenterFeatureCollection['features'][number]): AIDataCenter | null => {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  if (!isNumber(longitude) || !isNumber(latitude)) return null;

  const properties = feature.properties || {};
  const id = String(properties.id || feature.id || '').trim();
  const name = String(properties.name || '').trim();
  if (!id || !name) return null;

  return {
    id,
    originalId: properties.originalId,
    name,
    developer: properties.developer,
    operator: properties.operator,
    status: properties.status || 'Unknown',
    rawStatus: properties.rawStatus,
    dataCenterType: properties.dataCenterType,
    stages: properties.stages,
    coordinates: [longitude, latitude],
    address: properties.address,
    city: properties.city,
    county: properties.county,
    state: properties.state,
    country: properties.country,
    powerMw: properties.powerMw,
    squareFeet: properties.squareFeet,
    siteSizeRaw: properties.siteSizeRaw,
    sizeUnits: properties.sizeUnits,
    acreage: properties.acreage,
    capitalExpenditure: properties.capitalExpenditure,
    capitalExpenditureRaw: properties.capitalExpenditureRaw,
    operatingDate: properties.operatingDate,
    operatingYear: properties.operatingYear,
    estimatedDailyElectricityUse: properties.estimatedDailyElectricityUse,
    estimatedDailyWaterUse: properties.estimatedDailyWaterUse,
    estimatedHomesEquivalent: properties.estimatedHomesEquivalent,
    citationCount: properties.citationCount,
    sources: properties.sources,
    nearbyPowerPlantCount: properties.nearbyPowerPlantCount,
    nearestPowerPlant: properties.nearestPowerPlant,
    sourceEndpoint: properties.sourceEndpoint,
    retrievedAtUtc: properties.retrievedAtUtc,
    sourceType: 'ai-data-center-workbook',
  };
};

export function useAIDataCenters({
  enabled,
  nearPowerPlantsEnabled = false,
  nearPowerPlantsRadiusMiles,
  powerPlantSectorFilter = 'all',
  filteredSources,
  enabledCountries,
  filteredStatuses,
  minPowerOutput,
  maxPowerOutput,
  minCapacityFactor,
  maxCapacityFactor,
}: UseAIDataCentersParams) {
  const [dataCenters, setDataCenters] = useState<AIDataCenter[]>([]);
  const [metadata, setMetadata] = useState<AIDataCenterFeatureCollection['metadata'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceKey = useMemo(() => toSortedCsv(filteredSources), [filteredSources]);
  const countryKey = useMemo(() => toSortedCsv(enabledCountries), [enabledCountries]);
  const statusKey = useMemo(() => toSortedCsv(filteredStatuses), [filteredStatuses]);
  const endpoint = useMemo(() => {
    if (!nearPowerPlantsEnabled) return '/api/ai-data-centers';

    const params = new URLSearchParams();
    appendNumberParam(params, 'radiusMiles', nearPowerPlantsRadiusMiles);
    if (sourceKey) params.set('sources', sourceKey);
    if (countryKey) params.set('countries', countryKey);
    if (statusKey) params.set('statuses', statusKey);
    if (powerPlantSectorFilter !== 'all') params.set('sector', powerPlantSectorFilter);
    appendNumberParam(params, 'minCapacity', minPowerOutput);
    appendNumberParam(params, 'maxCapacity', maxPowerOutput);
    appendNumberParam(params, 'minCapacityFactor', minCapacityFactor);
    appendNumberParam(params, 'maxCapacityFactor', maxCapacityFactor);

    return `/api/ai-data-centers/near-power-plants?${params.toString()}`;
  }, [
    countryKey,
    maxCapacityFactor,
    maxPowerOutput,
    minCapacityFactor,
    minPowerOutput,
    nearPowerPlantsEnabled,
    nearPowerPlantsRadiusMiles,
    powerPlantSectorFilter,
    sourceKey,
    statusKey,
  ]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const loadAIDataCenters = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(endpoint, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load AI data centers: ${response.status}`);
        }

        const payload = (await response.json()) as AIDataCenterFeatureCollection;
        const normalized = Array.isArray(payload.features)
          ? payload.features.map(toAIDataCenter).filter((item): item is AIDataCenter => Boolean(item))
          : [];

        if (!cancelled) {
          setDataCenters(normalized);
          setMetadata(payload.metadata || null);
        }
      } catch (fetchError) {
        const isAbort =
          fetchError instanceof DOMException
            ? fetchError.name === 'AbortError'
            : fetchError instanceof Error && fetchError.name === 'AbortError';
        if (isAbort || cancelled) return;

        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load AI data centers');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAIDataCenters();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, endpoint]);

  const visibleCount = useMemo(() => dataCenters.length, [dataCenters]);

  return {
    dataCenters,
    metadata,
    loading,
    error,
    visibleCount,
  };
}
