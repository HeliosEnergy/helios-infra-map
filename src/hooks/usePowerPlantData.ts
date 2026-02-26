import { useEffect, useMemo, useState } from 'react';
import type { PowerPlant } from '../models/PowerPlant';
import { calculateBbox } from '../utils/bboxUtils';
import { authenticatedFetch } from '../utils/auth';
import type { PowerPlantMetadata, PowerPlantPage } from '../types/powerPlantApi';
import { useDebounce } from './useDebounce';

const POWER_PLANTS_PAGE_SIZE = 10000;
const MAX_AUTO_PAGINATION_PAGES = 20;

export type MapViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
};

export type UsePowerPlantDataParams = {
  viewState: MapViewState;
  filteredSources: Set<string>;
  enabledCountries: Set<string>;
  filteredStatuses: Set<string>;
  minPowerOutput: number;
  maxPowerOutput: number;
  minCapacityFactor: number;
  maxCapacityFactor: number;
  showOnlyNearbyPlants: boolean;
  proximityDistance: number;
  isFilterStateReady: boolean;
};

const expandBboxByMiles = (
  bbox: [number, number, number, number],
  centerLat: number,
  miles: number
): [number, number, number, number] => {
  if (miles <= 0) return bbox;

  const deltaLat = miles / 69;
  const latRad = (centerLat * Math.PI) / 180;
  const cosLat = Math.max(0.01, Math.abs(Math.cos(latRad)));
  const deltaLon = miles / (69 * cosLat);

  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [
    Math.max(-180, minLon - deltaLon),
    Math.max(-90, minLat - deltaLat),
    Math.min(180, maxLon + deltaLon),
    Math.min(90, maxLat + deltaLat),
  ];
};

const setToSortedCsv = (values: Set<string>): string | undefined => {
  if (values.size === 0) return undefined;
  return Array.from(values).sort().join(',');
};

const buildQuery = (params: UsePowerPlantDataParams) => {
  const baseBbox = calculateBbox(params.viewState.longitude, params.viewState.latitude, params.viewState.zoom);
  const effectiveBbox = params.showOnlyNearbyPlants
    ? expandBboxByMiles(baseBbox, params.viewState.latitude, params.proximityDistance)
    : baseBbox;

  return {
    bbox: effectiveBbox,
    sources: params.filteredSources.size === 0 ? '__none__' : setToSortedCsv(params.filteredSources),
    countries: setToSortedCsv(params.enabledCountries),
    statuses: setToSortedCsv(params.filteredStatuses),
    minCapacity: params.minPowerOutput,
    maxCapacity: params.maxPowerOutput,
    minCapacityFactor: params.minCapacityFactor,
    maxCapacityFactor: params.maxCapacityFactor,
    limit: POWER_PLANTS_PAGE_SIZE,
    offset: 0,
  };
};

const buildQueryKey = (query: ReturnType<typeof buildQuery>): string => JSON.stringify(query);

export function usePowerPlantData(params: UsePowerPlantDataParams) {
  const [powerPlants, setPowerPlants] = useState<PowerPlant[]>([]);
  const [metadata, setMetadata] = useState<PowerPlantMetadata | null>(null);
  const [page, setPage] = useState<PowerPlantPage['page'] | null>(null);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMetadata = async () => {
      setLoadingMetadata(true);
      try {
        const response = await authenticatedFetch('/api/power-plants/metadata');
        if (!response.ok) {
          throw new Error(`Failed to load metadata: ${response.status}`);
        }

        const payload = (await response.json()) as PowerPlantMetadata;
        if (!cancelled) {
          setMetadata(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load metadata');
        }
      } finally {
        if (!cancelled) {
          setLoadingMetadata(false);
        }
      }
    };

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  const query = useMemo(() => buildQuery(params), [params]);
  const debouncedQueryKey = useDebounce(buildQueryKey(query), 300);

  useEffect(() => {
    let cancelled = false;

    const loadPlants = async () => {
      if (!params.isFilterStateReady) {
        setLoadingPlants(false);
        return;
      }

      setLoadingPlants(true);
      setError(null);

      try {
        const parsed = JSON.parse(debouncedQueryKey) as ReturnType<typeof buildQuery>;

        const baseSearchParams = new URLSearchParams({
          bbox: parsed.bbox.join(','),
          minCapacity: parsed.minCapacity.toString(),
          maxCapacity: parsed.maxCapacity.toString(),
          minCapacityFactor: parsed.minCapacityFactor.toString(),
          maxCapacityFactor: parsed.maxCapacityFactor.toString(),
        });

        if (parsed.sources) baseSearchParams.set('sources', parsed.sources);
        if (parsed.countries) baseSearchParams.set('countries', parsed.countries);
        if (parsed.statuses) baseSearchParams.set('statuses', parsed.statuses);

        let offset = parsed.offset;
        let pageCount = 0;
        let finalPage: PowerPlantPage['page'] | null = null;
        const allPlants: PowerPlant[] = [];

        while (pageCount < MAX_AUTO_PAGINATION_PAGES) {
          if (cancelled) return;

          const searchParams = new URLSearchParams(baseSearchParams);
          searchParams.set('limit', parsed.limit.toString());
          searchParams.set('offset', offset.toString());

          const response = await authenticatedFetch(`/api/power-plants?${searchParams.toString()}`);
          if (!response.ok) {
            throw new Error(`Failed to load power plants: ${response.status}`);
          }

          const payload = (await response.json()) as PowerPlantPage;
          const pageData = Array.isArray(payload.data) ? payload.data : [];
          const pageInfo = payload?.page ?? null;

          allPlants.push(...pageData);
          finalPage = pageInfo;

          if (!pageInfo?.hasMore || pageData.length === 0) {
            break;
          }

          offset += pageData.length;
          pageCount += 1;
        }

        if (!cancelled) {
          const total = finalPage?.total ?? allPlants.length;
          const hasMore = finalPage?.hasMore ?? false;

          setPowerPlants(allPlants);
          setPage({
            limit: allPlants.length,
            offset: parsed.offset,
            total,
            hasMore,
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load power plants');
          setPowerPlants([]);
          setPage(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPlants(false);
        }
      }
    };

    loadPlants();

    return () => {
      cancelled = true;
    };
  }, [debouncedQueryKey, params.isFilterStateReady]);

  return {
    powerPlants,
    page,
    metadata,
    loading: loadingPlants || loadingMetadata,
    loadingPlants,
    loadingMetadata,
    error,
  };
}
