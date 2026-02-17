import { useState, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { MVTLayer } from '@deck.gl/geo-layers';
import { PathLayer } from '@deck.gl/layers';
import type { FiberCable } from '../models/FiberCable';
import type { HoveredFiberCable, HoveredHifldLine } from '../types/vectorFeatures';
import { authenticatedFetch } from '../utils/auth';
import {
  featureToFiberCable,
  featureToHifldLine,
  type GeoJsonLikeFeature,
} from '../utils/vectorFeatureUtils';

type UseVectorTileLayersParams = {
  showFiberCables: boolean;
  showHifldLines: boolean;
  zoom: number;
  longitude: number;
  latitude: number;
  isFiberTooltipPersistent: boolean;
  fiberHoverTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  lineHoverTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  onHoveredFiberCable: (cable: HoveredFiberCable | null) => void;
  onHoveredHifldLine: (line: HoveredHifldLine | null) => void;
  onFiberViewportCables: (cables: FiberCable[]) => void;
};

const fetchTileWithAuth = async (url: string, init?: RequestInit): Promise<Response> => {
  return authenticatedFetch(url, init);
};

/** Compute a bbox from viewport center + zoom. */
function viewportToBbox(longitude: number, latitude: number, zoom: number) {
  const latRange = 180 / Math.pow(2, zoom);
  const lonRange = 360 / Math.pow(2, zoom);
  return {
    minLon: longitude - lonRange,
    maxLon: longitude + lonRange,
    minLat: latitude - latRange,
    maxLat: latitude + latRange,
  };
}

export function useVectorTileLayers({
  showFiberCables,
  showHifldLines,
  zoom,
  longitude,
  latitude,
  isFiberTooltipPersistent,
  fiberHoverTimeoutRef,
  lineHoverTimeoutRef,
  onHoveredFiberCable,
  onHoveredHifldLine,
  onFiberViewportCables,
}: UseVectorTileLayersParams) {
  // ─── Fiber GeoJSON state ───────────────────────────────────────────
  const [fiberFeatures, setFiberFeatures] = useState<GeoJsonLikeFeature[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quantize viewport so we don't re-fetch on every fractional change.
  // Longitude/latitude rounded to 1 decimal, zoom floored to integer.
  const qZoom = Math.floor(zoom);
  const qLon = Math.round(longitude * 10) / 10;
  const qLat = Math.round(latitude * 10) / 10;

  // Debounced fetch of fiber cables from /api/fiber-bbox
  useEffect(() => {
    if (!showFiberCables || qZoom < 4) {
      setFiberFeatures([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Longer debounce at low zoom (bigger requests)
    const delay = qZoom < 7 ? 500 : 300;

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const bbox = viewportToBbox(qLon, qLat, qZoom);
      // Use overview mode at low zoom to get sampled, lighter data
      const overview = qZoom < 8 ? '&overview=1' : '';
      const url = `/api/fiber-bbox?minLon=${bbox.minLon}&minLat=${bbox.minLat}&maxLon=${bbox.maxLon}&maxLat=${bbox.maxLat}&zoom=${qZoom}${overview}`;

      authenticatedFetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`fiber-bbox ${res.status}`);
          return res.json();
        })
        .then((geojson: { features?: GeoJsonLikeFeature[] }) => {
          if (controller.signal.aborted) return;
          const features = geojson.features ?? [];
          setFiberFeatures(features);

          // Convert to FiberCable[] for nearby-fiber analysis
          const cables: FiberCable[] = [];
          const dedupe = new Set<string>();
          for (let i = 0; i < features.length; i++) {
            const cable = featureToFiberCable(features[i], `fiber-${i}`);
            if (!cable || dedupe.has(cable.id)) continue;
            dedupe.add(cable.id);
            cables.push(cable);
          }
          onFiberViewportCables(cables);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error('Failed to fetch fiber cables:', err);
        });
    }, delay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFiberCables, qZoom, qLon, qLat]);

  // ─── Fiber PathLayer (zoom-adaptive styling) ───────────────────────
  const fiberLayer = useMemo(() => {
    if (!showFiberCables || zoom < 4 || fiberFeatures.length === 0) return null;

    // Scale opacity and width by zoom for visual clarity
    // Low zoom (4-6): thin + transparent → less clutter
    // Mid zoom (7-9): medium
    // High zoom (10+): full width + opaque
    let lineWidth: number;
    let opacity: number;
    if (zoom < 7) {
      lineWidth = 1;
      opacity = 0.35;
    } else if (zoom < 10) {
      lineWidth = 1.5;
      opacity = 0.6;
    } else {
      lineWidth = 2;
      opacity = 0.85;
    }

    return new PathLayer<GeoJsonLikeFeature>({
      id: 'fiber-cables',
      data: fiberFeatures,
      getPath: (d: GeoJsonLikeFeature) => {
        const geom = d.geometry;
        if (!geom || !geom.coordinates) return [];
        if (geom.type === 'LineString') return geom.coordinates as [number, number][];
        if (geom.type === 'MultiLineString') {
          const multi = geom.coordinates as [number, number][][];
          return multi[0] || [];
        }
        return [];
      },
      getColor: [200, 0, 200],
      getWidth: lineWidth,
      opacity,
      widthUnits: 'pixels',
      widthMinPixels: 1,
      pickable: true,
      autoHighlight: false,
      onHover: (info: { object?: GeoJsonLikeFeature }) => {
        if (fiberHoverTimeoutRef.current) {
          clearTimeout(fiberHoverTimeoutRef.current);
          fiberHoverTimeoutRef.current = null;
        }

        if (info.object) {
          const cable = featureToFiberCable(info.object, 'fiber-hover');
          onHoveredFiberCable(cable);
        } else if (!isFiberTooltipPersistent) {
          fiberHoverTimeoutRef.current = setTimeout(() => {
            onHoveredFiberCable(null);
            fiberHoverTimeoutRef.current = null;
          }, 2500);
        }
      },
    });
  }, [
    showFiberCables,
    zoom,
    fiberFeatures,
    isFiberTooltipPersistent,
    fiberHoverTimeoutRef,
    onHoveredFiberCable,
  ]);

  // ─── HIFLD MVTLayer (unchanged) ───────────────────────────────────
  const hifldLayer = useMemo(() => {
    if (!showHifldLines) return null;

    return new MVTLayer({
      id: 'hifld-lines',
      data: '/api/vector/hifld/{z}/{x}/{y}.pbf',
      minZoom: 2,
      maxZoom: 14,
      binary: false,
      pickable: true,
      stroked: true,
      filled: false,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1,
      getLineColor: (feature: { properties?: Record<string, unknown> }) => {
        const properties = feature.properties || {};
        const voltage = Number(properties.voltage ?? properties.VOLTAGE ?? 0);
        const voltClass = String(properties.voltClass ?? properties.VOLT_CLASS ?? '');

        if (voltClass === '765' || voltClass === '500' || voltage >= 500) {
          return [0, 150, 255, 180];
        }

        if (voltClass === '345' || voltClass === '230' || voltage >= 230) {
          return [50, 120, 200, 140];
        }

        return [100, 150, 200, 100];
      },
      getLineWidth: (feature: { properties?: Record<string, unknown> }) => {
        const properties = feature.properties || {};
        const voltClass = String(properties.voltClass ?? properties.VOLT_CLASS ?? '');

        if (voltClass === '765' || voltClass === '500') return 1.2;
        if (voltClass === '345' || voltClass === '230') return 0.9;
        return 0.7;
      },
      getPickingRadius: 35,
      opacity: 0.8,
      autoHighlight: false,
      highlightColor: [255, 200, 0, 255],
      lineCapRounded: false,
      lineJointRounded: false,
      loadOptions: {
        fetch: fetchTileWithAuth,
      },
      onHover: (info: { object?: GeoJsonLikeFeature }) => {
        if (lineHoverTimeoutRef.current) {
          clearTimeout(lineHoverTimeoutRef.current);
          lineHoverTimeoutRef.current = null;
        }

        if (info.object) {
          const line = featureToHifldLine(info.object, 'hifld-hover');
          onHoveredHifldLine(line);
        } else {
          lineHoverTimeoutRef.current = setTimeout(() => {
            onHoveredHifldLine(null);
            lineHoverTimeoutRef.current = null;
          }, 1000);
        }
      },
    });
  }, [showHifldLines, lineHoverTimeoutRef, onHoveredHifldLine]);

  return {
    fiberLayer,
    hifldLayer,
  };
}
