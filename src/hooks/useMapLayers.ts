import { useMemo } from 'react';
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { PowerPlant } from '../models/PowerPlant';
import type { Cable } from '../models/Cable';
import { LOCATION_PIN_ICON } from '../utils/locationPinIcon';
import type { PowerRange } from '../utils/powerRangeCalculator';

type SizeByOption = 'nameplate_capacity' | 'capacity_factor' | 'generation';

type LocationHoverInfo = {
  x: number;
  y: number;
  address: string;
} | null;

type UseMapLayersParams = {
  selectedLocation: { coordinates: [number, number]; addressName: string } | null;
  locationCircle: [number, number][] | null;
  showRadiusCircle: boolean;
  showPowerPlants: boolean;
  filteredPowerPlants: PowerPlant[];
  sizeByOption: SizeByOption;
  sizeMultiplier: number;
  capacityWeight: number;
  powerRange: PowerRange;
  showWfsCables: boolean;
  wfsCables: Cable[];
  fiberLayer: Layer | null;
  hifldLayer: Layer | null;
  setHoverInfo: (plant: PowerPlant | null) => void;
  setLocationPinHoverInfo: (info: LocationHoverInfo) => void;
};

const POWER_PLANT_COLORS: Record<string, [number, number, number]> = {
  hydro: [31, 119, 180],
  gas: [255, 127, 14],
  wind: [44, 160, 44],
  nuclear: [214, 39, 40],
  coal: [64, 64, 64],
  solar: [255, 215, 0],
  oil: [128, 128, 128],
  biomass: [100, 180, 50],
  battery: [128, 0, 128],
  diesel: [192, 192, 192],
  geothermal: [160, 32, 240],
  tidal: [0, 191, 255],
  waste: [139, 69, 19],
  biofuel: [210, 180, 140],
  other: [148, 103, 189],
};

const CABLE_COLOR: [number, number, number] = [255, 165, 0];

export function useMapLayers({
  selectedLocation,
  locationCircle,
  showRadiusCircle,
  showPowerPlants,
  filteredPowerPlants,
  sizeByOption,
  sizeMultiplier,
  capacityWeight,
  powerRange,
  showWfsCables,
  wfsCables,
  fiberLayer,
  hifldLayer,
  setHoverInfo,
  setLocationPinHoverInfo,
}: UseMapLayersParams) {
  return useMemo(() => {
    const layerList = [
      selectedLocation && locationCircle && showRadiusCircle &&
        new PolygonLayer({
          id: 'location-radius-circle',
          data: [{
            polygon: locationCircle,
            center: selectedLocation.coordinates,
          }],
          pickable: false,
          stroked: true,
          filled: true,
          wireframe: false,
          lineWidthMinPixels: 2,
          getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
          getFillColor: [59, 130, 246, 30],
          getLineColor: [59, 130, 246, 150],
          getLineWidth: 2,
          updateTriggers: {
            getPolygon: [locationCircle],
          },
        }),
      selectedLocation &&
        new IconLayer({
          id: 'location-pin',
          data: [{
            coordinates: selectedLocation.coordinates,
            addressName: selectedLocation.addressName,
          }],
          pickable: true,
          iconAtlas: LOCATION_PIN_ICON.url,
          iconMapping: {
            marker: {
              x: 0,
              y: 0,
              width: LOCATION_PIN_ICON.width,
              height: LOCATION_PIN_ICON.height,
              anchorY: LOCATION_PIN_ICON.anchorY,
              mask: false,
            },
          },
          getIcon: () => 'marker',
          getPosition: (d: { coordinates: [number, number] }) => d.coordinates,
          getSize: 32,
          getColor: [255, 255, 255, 255],
          sizeScale: 1,
          sizeMinPixels: 20,
          sizeMaxPixels: 40,
          onHover: (info: { object?: { addressName: string }; x?: number; y?: number }) => {
            if (info.object && info.x !== undefined && info.y !== undefined) {
              setLocationPinHoverInfo({
                x: info.x,
                y: info.y,
                address: info.object.addressName,
              });
            } else {
              setLocationPinHoverInfo(null);
            }
          },
        }),
      showPowerPlants &&
        new ScatterplotLayer({
          id: 'power-plants',
          data: filteredPowerPlants,
          pickable: true,
          cursor: 'pointer',
          opacity: 0.8,
          filled: true,
          radiusUnits: 'pixels',
          radiusMinPixels: 2,
          radiusMaxPixels: 100,
          getPosition: (d: PowerPlant) => d.coordinates,
          getRadius: (d: PowerPlant) => {
            let value;
            switch (sizeByOption) {
              case 'nameplate_capacity':
                value = d.output;
                break;
              case 'capacity_factor':
                value = d.capacityFactor || d.output;
                break;
              case 'generation':
                value = d.historicalAvgGeneration || d.generation || d.output;
                break;
              default:
                value = d.output;
            }

            const sqrtValue = Math.sqrt(Math.max(value, 1));
            const sqrtMin = Math.sqrt(Math.max(powerRange.min, 1));
            const sqrtMax = Math.sqrt(Math.max(powerRange.max, 1));
            const normalized = sqrtMax > sqrtMin ? (sqrtValue - sqrtMin) / (sqrtMax - sqrtMin) : 0;
            const exaggerationFactor = sizeByOption === 'capacity_factor' ? 5 : 1;
            return sizeMultiplier * 2 + capacityWeight * normalized * 25 * exaggerationFactor;
          },
          updateTriggers: {
            getRadius: [sizeMultiplier, capacityWeight, sizeByOption, powerRange],
          },
          getFillColor: (d: PowerPlant) => POWER_PLANT_COLORS[d.source] || POWER_PLANT_COLORS.other,
          onHover: (info: { object?: PowerPlant }) => setHoverInfo(info.object || null),
        }),
      showWfsCables &&
        new PathLayer({
          id: 'wfs-cables',
          data: wfsCables,
          pickable: true,
          widthMinPixels: 1,
          getPath: (d: Cable) => d.coordinates,
          getColor: CABLE_COLOR,
          getWidth: 2,
          onHover: () => {},
        }),
      fiberLayer,
      hifldLayer,
    ];

    return layerList.filter(Boolean) as Layer[];
  }, [
    selectedLocation,
    locationCircle,
    showRadiusCircle,
    showPowerPlants,
    filteredPowerPlants,
    sizeByOption,
    sizeMultiplier,
    capacityWeight,
    powerRange,
    showWfsCables,
    wfsCables,
    fiberLayer,
    hifldLayer,
    setHoverInfo,
    setLocationPinHoverInfo,
  ]);
}
