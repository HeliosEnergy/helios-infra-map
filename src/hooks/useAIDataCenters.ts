import { useEffect, useMemo, useState } from 'react';
import type { AIDataCenter, AIDataCenterFeatureCollection } from '../models/AIDataCenter';
import { authenticatedFetch } from '../utils/auth';

type UseAIDataCentersParams = {
  enabled: boolean;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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
    sourceEndpoint: properties.sourceEndpoint,
    retrievedAtUtc: properties.retrievedAtUtc,
    sourceType: 'ai-data-center-workbook',
  };
};

export function useAIDataCenters({ enabled }: UseAIDataCentersParams) {
  const [dataCenters, setDataCenters] = useState<AIDataCenter[]>([]);
  const [metadata, setMetadata] = useState<AIDataCenterFeatureCollection['metadata'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const response = await authenticatedFetch('/api/ai-data-centers', {
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
  }, [enabled]);

  const visibleCount = useMemo(() => dataCenters.length, [dataCenters]);

  return {
    dataCenters,
    metadata,
    loading,
    error,
    visibleCount,
  };
}
