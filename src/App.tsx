import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Map, { NavigationControl } from 'react-map-gl';
import DeckGL from '@deck.gl/react';
import './App.css';
import type { PowerPlant } from './models/PowerPlant';
import type { Cable } from './models/Cable';
import type { FiberCable } from './models/FiberCable';
import { loadWfsCableData } from './utils/wfsDataLoader';
import { generateCirclePolygon } from './utils/geoUtils';
import type { LineSegment } from './utils/spatialIndex';
import { createLineIndex } from './utils/spatialIndex';
import RBush from 'rbush';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';
import SidePanel from './components/SidePanel';
import ProximityDialog from './components/ProximityDialog';
import AddressSearch from './components/AddressSearch';
import LocationStatsPanel from './components/LocationStatsPanel';
import { Search, MapPin, X, AlertTriangle } from 'lucide-react';
import { useDebounce } from './hooks/useDebounce';
import { usePowerPlantData } from './hooks/usePowerPlantData';
import { useProximityAnalysis } from './hooks/useProximityAnalysis';
import { useVectorTileLayers } from './hooks/useVectorTileLayers';
import { useNearbyFiber } from './hooks/useNearbyFiber';
import { useMapLayers } from './hooks/useMapLayers';
import { featureToFiberCable, featureToHifldLine, type GeoJsonLikeFeature } from './utils/vectorFeatureUtils';
import type { HoveredHifldLine } from './types/vectorFeatures';

// SizeByOption type as per MAP_FEATURES_DOCUMENTATION.md
type SizeByOption = 'nameplate_capacity' | 'capacity_factor' | 'generation';

// Function to get country name from country code
function getCountryName(countryCode: string): string {
  const countryNames: Record<string, string> = {
    'CA': 'Canada',
    'US': 'United States',
    'KZ': 'Kazakhstan',
    'AE': 'United Arab Emirates',
    'IN': 'India',
    'KG': 'Kyrgyzstan',
    'CHN': 'China',
    'GBR': 'United Kingdom',
    'BRA': 'Brazil',
    'FRA': 'France',
    'DEU': 'Germany',
    'ESP': 'Spain',
    'RUS': 'Russia',
    'JPN': 'Japan',
    'AUS': 'Australia',
    'PRT': 'Portugal',
    'CZE': 'Czech Republic',
    'ITA': 'Italy',
    'CHL': 'Chile',
    'NOR': 'Norway',
    'MEX': 'Mexico',
    'VNM': 'Vietnam',
    'ARG': 'Argentina',
    'THA': 'Thailand',
    'POL': 'Poland',
    'FIN': 'Finland',
    'IDN': 'Indonesia',
    'SWE': 'Sweden',
    'CHE': 'Switzerland',
    'TUR': 'Turkey',
    'KOR': 'South Korea',
    'PHL': 'Philippines',
    'IRN': 'Iran',
    'ZAF': 'South Africa',
    'AUT': 'Austria',
    'SAU': 'Saudi Arabia',
    'GRC': 'Greece',
    'GTM': 'Guatemala',
    'URY': 'Uruguay',
    'NLD': 'Netherlands',
    'BEL': 'Belgium',
    'ROU': 'Romania',
    'UKR': 'Ukraine',
    'PAK': 'Pakistan',
    'EGY': 'Egypt',
    'ISR': 'Israel',
    'IRL': 'Ireland',
    'DZA': 'Algeria',
    'BGD': 'Bangladesh',
    'MYS': 'Malaysia',
    'LKA': 'Sri Lanka',
    'DNK': 'Denmark',
    'MAR': 'Morocco',
    'VEN': 'Venezuela',
    'NZL': 'New Zealand',
    'BGR': 'Bulgaria',
    'HND': 'Honduras',
    'TWN': 'Taiwan',
    'MMR': 'Myanmar',
    'JOR': 'Jordan',
    'PER': 'Peru',
    'PRK': 'North Korea',
    'SVK': 'Slovakia',
    'IRQ': 'Iraq',
    'TUN': 'Tunisia',
    'CRI': 'Costa Rica',
    'BOL': 'Bolivia',
    'COL': 'Colombia',
    'HRV': 'Croatia',
    'BLR': 'Belarus',
    'MUS': 'Mauritius',
    'KEN': 'Kenya',
    'ECU': 'Ecuador',
    'LAO': 'Laos',
    'ISL': 'Iceland',
    'BIH': 'Bosnia and Herzegovina',
    'SDN': 'Sudan',
    'GEO': 'Georgia',
    'SYR': 'Syria',
    'HUN': 'Hungary',
    'PAN': 'Panama',
    'EST': 'Estonia',
    'UZB': 'Uzbekistan',
    'SLV': 'El Salvador',
    'NIC': 'Nicaragua',
    'KHM': 'Cambodia',
    'ZMB': 'Zambia',
    'PNG': 'Papua New Guinea',
    'DOM': 'Dominican Republic',
    'COD': 'Democratic Republic of the Congo',
    'SGP': 'Singapore',
    'NPL': 'Nepal',
    'CUB': 'Cuba',
    'AZE': 'Azerbaijan',
    'AGO': 'Angola',
    'NGA': 'Nigeria',
    'NAM': 'Namibia',
    'ETH': 'Ethiopia',
    'SRB': 'Serbia',
    'QAT': 'Qatar',
    'OMN': 'Oman',
    'MKD': 'North Macedonia',
    'MDG': 'Madagascar',
    'LBY': 'Libya',
    'FJI': 'Fiji',
    'UGA': 'Uganda',
    'TZA': 'Tanzania',
    'RWA': 'Rwanda',
    'TJK': 'Tajikistan',
    'SEN': 'Senegal',
    'JAM': 'Jamaica',
    'KWT': 'Kuwait',
    'GIN': 'Guinea',
    'AFG': 'Afghanistan',
    'SVN': 'Slovenia',
    'MNG': 'Mongolia',
    'COG': 'Republic of the Congo',
    'CMR': 'Cameroon',
    'CIV': 'Ivory Coast',
    'BHR': 'Bahrain',
    'ARM': 'Armenia',
    'ALB': 'Albania',
    'YEM': 'Yemen',
    'TKM': 'Turkmenistan',
    'NER': 'Niger',
    'MRT': 'Mauritania',
    'LBN': 'Lebanon',
    'BFA': 'Burkina Faso',
    'TTO': 'Trinidad and Tobago',
    'SWZ': 'Eswatini',
    'MDA': 'Moldova',
    'LTU': 'Lithuania',
    'GUF': 'French Guiana',
    'GHA': 'Ghana',
    'GAB': 'Gabon',
    'MWI': 'Malawi',
    'LVA': 'Latvia',
    'GUY': 'Guyana',
    'BTN': 'Bhutan',
    'MLI': 'Mali',
    'CPV': 'Cape Verde',
    'BRN': 'Brunei',
    'BDI': 'Burundi',
    'TGO': 'Togo',
    'SLE': 'Sierra Leone',
    'PRY': 'Paraguay',
    'MOZ': 'Mozambique',
    'MNE': 'Montenegro',
    'GNQ': 'Equatorial Guinea',
    'CYP': 'Cyprus',
    'ZWE': 'Zimbabwe',
    'LUX': 'Luxembourg',
    'LBR': 'Liberia',
    'KOS': 'Kosovo',
    'GMB': 'Gambia',
    'ERI': 'Eritrea',
    'CAF': 'Central African Republic',
    'BWA': 'Botswana',
    'BEN': 'Benin',
    'ATA': 'Antarctica',
    'SUR': 'Suriname',
    'PSE': 'Palestine',
    'LSO': 'Lesotho',
    'LCA': 'Saint Lucia',
    'GNB': 'Guinea-Bissau',
    'ESH': 'Western Sahara',
    'DJI': 'Djibouti'
  };

  return countryNames[countryCode] || countryCode;
}

// Mapbox token from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE';

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

function App() {
  const { theme } = useTheme();
  const [wfsCables, setWfsCables] = useState<Cable[]>([]);
  const [showPowerPlants, setShowPowerPlants] = useState<boolean>(true);
  const [showWfsCables, setShowWfsCables] = useState<boolean>(true);
  const [showHifldLines, setShowHifldLines] = useState<boolean>(false);
  const [showFiberCables, setShowFiberCables] = useState<boolean>(true);

  const [hoverInfo, setHoverInfo] = useState<PowerPlant | null>(null);
  const [hoveredLine, setHoveredLine] = useState<HoveredHifldLine | null>(null);
  const [locationPinHoverInfo, setLocationPinHoverInfo] = useState<{ x: number; y: number; address: string } | null>(null);
  const [isLineTooltipPersistent, setIsLineTooltipPersistent] = useState<boolean>(false);
  const [persistentLine, setPersistentLine] = useState<HoveredHifldLine | null>(null);
  const [hoveredFiberCable, setHoveredFiberCable] = useState<FiberCable | null>(null);
  const [isFiberTooltipPersistent, setIsFiberTooltipPersistent] = useState<boolean>(false);
  const [persistentFiberCable, setPersistentFiberCable] = useState<FiberCable | null>(null);
  const [loadedFiberCables, setLoadedFiberCables] = useState<FiberCable[]>([]);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fiberHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [filteredSources, setFilteredSources] = useState<Set<string>>(new Set());
  const [minPowerOutput, setMinPowerOutput] = useState<number>(0);
  const [maxPowerOutput, setMaxPowerOutput] = useState<number>(10000);
  const [minCapacityFactor, setMinCapacityFactor] = useState<number>(0);
  const [maxCapacityFactor, setMaxCapacityFactor] = useState<number>(100);

  const [showCanadianPlants, setShowCanadianPlants] = useState<boolean>(true);
  const [showAmericanPlants, setShowAmericanPlants] = useState<boolean>(true);
  const [showKazakhstanPlants, setShowKazakhstanPlants] = useState<boolean>(true);
  const [showUaePlants, setShowUaePlants] = useState<boolean>(true);
  const [showIndiaPlants, setShowIndiaPlants] = useState<boolean>(true);
  const [showKyrgyzstanPlants, setShowKyrgyzstanPlants] = useState<boolean>(true);

  const [enabledCountries, setEnabledCountries] = useState<Set<string>>(new Set(['US']));
  const [allCountries, setAllCountries] = useState<Array<{code: string, name: string, count: number, usedCapacity?: number}>>([]);

  const [showOnlyNearbyPlants, setShowOnlyNearbyPlants] = useState<boolean>(false);
  const [proximityDistance, setProximityDistance] = useState<number>(0);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const debouncedDistance = useDebounce(sliderValue, 300);

  useEffect(() => {
    setProximityDistance(sliderValue);
  }, [sliderValue]);

  const handleSliderChange = useCallback((value: number) => {
    setSliderValue(value);
  }, []);

  const [lineIndex, setLineIndex] = useState<RBush<LineSegment> | null>(null);
  const [powerRange, setPowerRange] = useState<{ min: number; max: number }>({ min: 0, max: 10000 });
  const [sizeMultiplier, setSizeMultiplier] = useState<number>(2);
  const [capacityWeight, setCapacityWeight] = useState<number>(1);
  const [sizeByOption, setSizeByOption] = useState<SizeByOption>('nameplate_capacity');
  const [isTooltipPersistent, setIsTooltipPersistent] = useState<boolean>(false);
  const [persistentPlant, setPersistentPlant] = useState<PowerPlant | null>(null);
  const [isProximityDialogOpen, setIsProximityDialogOpen] = useState<boolean>(false);
  const [allStatuses, setAllStatuses] = useState<string[]>([]);
  const [filteredStatuses, setFilteredStatuses] = useState<Set<string>>(new Set());
  const [isFilterStateReady, setIsFilterStateReady] = useState(false);
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());

  const [viewState, setViewState] = useState({
    longitude: -95,
    latitude: 40,
    zoom: 3,
    pitch: 0,
    bearing: 0
  });

  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    addressName: string;
  } | null>(null);
  const [locationRadius, setLocationRadius] = useState<number>(5);
  const [isStatsPanelCollapsed, setIsStatsPanelCollapsed] = useState<boolean>(false);
  const [showRadiusCircle, setShowRadiusCircle] = useState<boolean>(false);

  const {
    powerPlants,
    page: powerPlantsPage,
    metadata: powerPlantMetadata,
    loading,
  } = usePowerPlantData({
    viewState,
    filteredSources,
    enabledCountries,
    filteredStatuses,
    minPowerOutput,
    maxPowerOutput,
    minCapacityFactor,
    maxCapacityFactor,
    showOnlyNearbyPlants,
    proximityDistance: debouncedDistance,
    isFilterStateReady,
  });

  useEffect(() => {
    let cancelled = false;

    const loadWfs = async () => {
      try {
        const wfsCableData = await loadWfsCableData();
        if (cancelled) return;

        setWfsCables(wfsCableData);
        const index = createLineIndex(wfsCableData);
        setLineIndex(index);
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading WFS cables:', error);
        }
      }
    };

    loadWfs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!powerPlantMetadata) return;

    setPowerRange(powerPlantMetadata.powerRange);

    setMinPowerOutput((prev) => {
      const min = powerPlantMetadata.powerRange.min;
      const max = powerPlantMetadata.powerRange.max;
      return Math.max(min, Math.min(prev, max));
    });

    setMaxPowerOutput((prev) => {
      const min = powerPlantMetadata.powerRange.min;
      const max = powerPlantMetadata.powerRange.max;
      return Math.min(max, Math.max(prev, min));
    });

    if (filteredSources.size === 0) {
      setFilteredSources(new Set(powerPlantMetadata.sources));
    }

    if (allStatuses.length === 0) {
      setAllStatuses(powerPlantMetadata.statuses);
      setFilteredStatuses(new Set(powerPlantMetadata.statuses));
    }

    if (allCountries.length === 0) {
      const countriesList = powerPlantMetadata.countries
        .map((country) => ({
          code: country.code,
          name: getCountryName(country.code),
          count: country.count,
          usedCapacity: country.usedCapacity,
        }))
        .sort((a, b) => b.count - a.count);

      setAllCountries(countriesList);

      if (enabledCountries.size === 0) {
        const hasUs = countriesList.some((country) => country.code === 'US');
        if (hasUs) {
          setEnabledCountries(new Set(['US']));
        }
      }
    }

    if (!isFilterStateReady) {
      setIsFilterStateReady(true);
    }
  }, [
    powerPlantMetadata,
    filteredSources.size,
    allStatuses.length,
    allCountries.length,
    enabledCountries.size,
    isFilterStateReady,
  ]);

  const toggleSourceFilter = (source: string) => {
    setFilteredSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(source)) {
        newSet.delete(source);
      } else {
        newSet.add(source);
      }
      return newSet;
    });
  };

  const allSourcesInData = powerPlantMetadata?.sources || [];

  const selectAllSources = () => {
    setFilteredSources(new Set(allSourcesInData));
  };

  const deselectAllSources = () => {
    setFilteredSources(new Set());
  };

  const toggleStatusFilter = (status: string) => {
    setFilteredStatuses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(status)) {
        newSet.delete(status);
      } else {
        newSet.add(status);
      }
      return newSet;
    });
  };

  const toggleCountryFilter = (countryCode: string) => {
    setEnabledCountries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(countryCode)) {
        newSet.delete(countryCode);
      } else {
        newSet.add(countryCode);
      }
      return newSet;
    });
  };

  const handlePlantSelect = (plantId: string) => {
    setSelectedPlantIds(prev => new Set(prev).add(plantId));
  };

  const handlePlantDeselect = (plantId: string) => {
    setSelectedPlantIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(plantId);
      return newSet;
    });
  };

  const handleApplySelection = () => {};

  const handleGoogleSearch = (plantName: string, source?: string, owner?: string) => {
    const searchTerms = [plantName];
    if (source) searchTerms.push(source);
    if (owner) searchTerms.push(owner);
    searchTerms.push('powerplant');

    const searchQuery = searchTerms.join(' ');
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGoogleMaps = (coordinates: [number, number]) => {
    const [lng, lat] = coordinates;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleLocationSelect = useCallback((coordinates: [number, number], zoom: number, addressName: string) => {
    const [lng, lat] = coordinates;
    setViewState({
      longitude: lng,
      latitude: lat,
      zoom,
      pitch: 0,
      bearing: 0,
    });
    setSelectedLocation({
      coordinates: [lng, lat],
      addressName,
    });
  }, []);

  const { nearbyFiberCables, isCalculatingNearbyFiber } = useNearbyFiber(
    persistentPlant,
    loadedFiberCables,
    showFiberCables
  );

  const { filteredPowerPlants, nearbyPlants, proximityPlantCount } = useProximityAnalysis({
    powerPlants,
    showOnlyNearbyPlants,
    lineIndex,
    proximityDistance: debouncedDistance,
    selectedPlantIds,
  });

  const { fiberLayer, hifldLayer } = useVectorTileLayers({
    showFiberCables,
    showHifldLines,
    zoom: viewState.zoom,
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    isFiberTooltipPersistent,
    fiberHoverTimeoutRef,
    lineHoverTimeoutRef: hoverTimeoutRef,
    onHoveredFiberCable: setHoveredFiberCable,
    onHoveredHifldLine: setHoveredLine,
    onFiberViewportCables: setLoadedFiberCables,
  });

  useEffect(() => {
    if (!showFiberCables || viewState.zoom < 4) {
      setLoadedFiberCables([]);
    }
  }, [showFiberCables, viewState.zoom]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (fiberHoverTimeoutRef.current) {
        clearTimeout(fiberHoverTimeoutRef.current);
        fiberHoverTimeoutRef.current = null;
      }
    };
  }, []);

  const powerPlantCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ...(powerPlantMetadata?.sourceCounts || {}),
    };
    counts.cables = wfsCables.length;
    return counts;
  }, [powerPlantMetadata, wfsCables.length]);

  const locationCircle = useMemo(() => {
    if (!selectedLocation) return null;
    return generateCirclePolygon(selectedLocation.coordinates, locationRadius, 64);
  }, [selectedLocation, locationRadius]);

  // Auto-zoom to fit circle when radius changes - ensures full circle is always visible
  // Updates immediately to show full circle perimeter as radius changes
  useEffect(() => {
    if (!selectedLocation || !locationCircle) return;

    const lons = locationCircle.map(p => p[0]);
    const lats = locationCircle.map(p => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const [centerLon, centerLat] = selectedLocation.coordinates;

    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportSize = Math.min(viewportWidth, viewportHeight);

    const latRad = centerLat * Math.PI / 180;
    const lonSpanAdjusted = lonSpan / Math.cos(latRad);
    const adjustedSpan = Math.max(latSpan, lonSpanAdjusted);

    const paddedSpan = adjustedSpan * 1.6;
    let zoom = Math.log2((viewportSize * 360) / (paddedSpan * 256));
    zoom = Math.max(10, Math.min(18, Math.round(zoom * 10) / 10));

    setViewState(prev => ({
      ...prev,
      longitude: centerLon,
      latitude: centerLat,
      zoom,
    }));
  }, [selectedLocation, locationRadius, locationCircle]);

  const layers = useMapLayers({
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
  });
  return (
    <div className="app-container">
      <Header />
      {loading && (
        <div className="loading-indicator">
          Loading data...
        </div>
      )}
      
      {/* Data Warning Message */}
      {!loading && powerPlantsPage?.hasMore && (
        <div className="data-warning">
          <AlertTriangle size={20} />
          <span>
            Showing {powerPlants.length} of {powerPlantsPage.total} power plants for this view.
            Zoom in or refine filters to reduce results.
          </span>
        </div>
      )}
      
      <div className="map-container">
        <AddressSearch 
          onLocationSelect={handleLocationSelect}
          mapboxToken={MAPBOX_TOKEN}
        />
        {selectedLocation && (
          <LocationStatsPanel
            coordinates={selectedLocation.coordinates}
            addressName={selectedLocation.addressName}
            powerPlants={powerPlants}
            radius={locationRadius}
            onRadiusChange={setLocationRadius}
            isCollapsed={isStatsPanelCollapsed}
            onToggleCollapse={() => setIsStatsPanelCollapsed(!isStatsPanelCollapsed)}
            onClose={() => {
              setSelectedLocation(null);
              setIsStatsPanelCollapsed(false);
              setShowRadiusCircle(false); // Reset to hide circle when reopening
              // Reset map to original view (USA-focused)
              setViewState({
                longitude: -95,
                latitude: 40,
                zoom: 3,
                pitch: 0,
                bearing: 0
              });
            }}
            showRadiusCircle={showRadiusCircle}
            onToggleRadiusCircle={() => setShowRadiusCircle(!showRadiusCircle)}
          />
        )}
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: newViewState }) => {
            if (newViewState && 'longitude' in newViewState && 'latitude' in newViewState) {
              const pitch = 'pitch' in newViewState && typeof newViewState.pitch === 'number'
                ? newViewState.pitch
                : 0;
              const bearing = 'bearing' in newViewState && typeof newViewState.bearing === 'number'
                ? newViewState.bearing
                : 0;
              setViewState({
                longitude: newViewState.longitude,
                latitude: newViewState.latitude,
                zoom: newViewState.zoom,
                pitch,
                bearing,
              });
            }
          }}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
          
          // Performance optimizations
          _typedArrayManagerProps={{
            overAlloc: 1, // Reduce memory allocation
            poolSize: 0 // Disable pooling for large datasets
          }}
          onClick={(info, event) => {
            if (info.object && info.layer?.id === 'power-plants') {
              event.stopPropagation();
              setHoverInfo(info.object);
              setIsTooltipPersistent(true);
              setPersistentPlant(info.object);
              return true;
            }
            if (info.object && info.layer?.id === 'hifld-lines') {
              event.stopPropagation();
              const line = featureToHifldLine(info.object as GeoJsonLikeFeature, 'hifld-click');
              if (!line) return false;
              setHoveredLine(line);
              setIsLineTooltipPersistent(true);
              setPersistentLine(line);
              return true;
            }
            if (info.object && info.layer?.id === 'fiber-cables') {
              event.stopPropagation();
              const cable = featureToFiberCable(info.object as GeoJsonLikeFeature, 'fiber-click');
              if (!cable) return false;
              setHoveredFiberCable(cable);
              setIsFiberTooltipPersistent(true);
              setPersistentFiberCable(cable);
              return true;
            }
            // Click on empty space - clear hover but keep persistent
            if (!info.object) {
              setHoverInfo(null);
              setHoveredLine(null);
              // Only clear fiber hover if not persistent (persistent stays visible)
              if (!isFiberTooltipPersistent) {
                setHoveredFiberCable(null);
              }
            }
            return false;
          }}
        >
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={theme === 'dark' ? "mapbox://styles/mapbox/dark-v10" : "mapbox://styles/mapbox/light-v10"}
          >
            <NavigationControl position="top-right" />
          </Map>
        </DeckGL>
        
        {/* Location Pin Hover Tooltip */}
        {locationPinHoverInfo && (
          <div
            className="location-pin-tooltip"
            style={{
              position: 'absolute',
              left: `${locationPinHoverInfo.x}px`,
              top: `${locationPinHoverInfo.y}px`,
              pointerEvents: 'none',
              zIndex: 10000,
            }}
          >
            <div className="location-pin-tooltip-content">
              {locationPinHoverInfo.address}
            </div>
          </div>
        )}
      </div>
      <Footer />

      {/* Unified Side Panel */}
      <SidePanel
        showPowerPlants={showPowerPlants}
        showWfsCables={showWfsCables}
        showHifldLines={showHifldLines}
        showFiberCables={showFiberCables}
        onTogglePowerPlants={() => setShowPowerPlants(!showPowerPlants)}
        onToggleWfsCables={() => setShowWfsCables(!showWfsCables)}
        onToggleHifldLines={() => setShowHifldLines(!showHifldLines)}
        onToggleFiberCables={() => setShowFiberCables(!showFiberCables)}
        filteredSources={filteredSources}
        onToggleSourceFilter={toggleSourceFilter}
        onSelectAllSources={selectAllSources}
        onDeselectAllSources={deselectAllSources}
        allStatuses={allStatuses}
        filteredStatuses={filteredStatuses}
        onToggleStatusFilter={toggleStatusFilter}
        showCanadianPlants={showCanadianPlants}
        showAmericanPlants={showAmericanPlants}
        showKazakhstanPlants={showKazakhstanPlants}
        showUaePlants={showUaePlants}
        showIndiaPlants={showIndiaPlants}
        showKyrgyzstanPlants={showKyrgyzstanPlants}
        onToggleCanadianPlants={() => setShowCanadianPlants(!showCanadianPlants)}
        onToggleAmericanPlants={() => setShowAmericanPlants(!showAmericanPlants)}
        onToggleKazakhstanPlants={() => setShowKazakhstanPlants(!showKazakhstanPlants)}
        onToggleUaePlants={() => setShowUaePlants(!showUaePlants)}
        onToggleIndiaPlants={() => setShowIndiaPlants(!showIndiaPlants)}
        onToggleKyrgyzstanPlants={() => setShowKyrgyzstanPlants(!showKyrgyzstanPlants)}
        allCountries={allCountries}
        enabledCountries={enabledCountries}
        onToggleCountryFilter={toggleCountryFilter}
        minPowerOutput={minPowerOutput}
        maxPowerOutput={maxPowerOutput}
        onMinPowerOutputChange={setMinPowerOutput}
        onMaxPowerOutputChange={setMaxPowerOutput}
        powerRange={powerRange}
        minCapacityFactor={minCapacityFactor}
        maxCapacityFactor={maxCapacityFactor}
        onMinCapacityFactorChange={setMinCapacityFactor}
        onMaxCapacityFactorChange={setMaxCapacityFactor}
        showOnlyNearbyPlants={showOnlyNearbyPlants}
        proximityDistance={proximityDistance}
        onToggleNearbyPlants={() => setShowOnlyNearbyPlants(!showOnlyNearbyPlants)}
        onProximityDistanceChange={handleSliderChange}
        proximityPlantCount={proximityPlantCount}
        onOpenProximityDialog={() => setIsProximityDialogOpen(true)}
        sizeMultiplier={sizeMultiplier}
        setSizeMultiplier={setSizeMultiplier}
        capacityWeight={capacityWeight}
        setCapacityWeight={setCapacityWeight}
        sizeByOption={sizeByOption}
        setSizeByOption={setSizeByOption}
        powerPlants={powerPlants}
        allSourcesInData={allSourcesInData}
        powerPlantCounts={powerPlantCounts}
        selectedPlantIds={selectedPlantIds}
        onPlantSelect={handlePlantSelect}
        onPlantDeselect={handlePlantDeselect}
        onApplySelection={handleApplySelection}
      />

       {/* Proximity Dialog */}
       <ProximityDialog
         isOpen={isProximityDialogOpen}
         onClose={() => setIsProximityDialogOpen(false)}
         proximityDistance={sliderValue}
         onDistanceChange={handleSliderChange}
         nearbyPlants={nearbyPlants}
         isCalculating={sliderValue !== debouncedDistance}
       />

        {/* Info Panels Container - Stacked Vertically */}
        <div className="info-panel-container">
          {/* Unified Info Panel - Power Plant */}
          {(hoverInfo || (isTooltipPersistent && persistentPlant)) && (
            <div className="info-panel plant-panel">
            {/* Close button only when persistent */}
            {isTooltipPersistent && (
              <button
                className="close-button"
                onClick={() => {
                  setIsTooltipPersistent(false);
                  setHoverInfo(null);
                  setPersistentPlant(null);
                }}
                aria-label="Close tooltip"
              >
                <X size={16} />
              </button>
            )}

             {(() => {
               const plant = hoverInfo || persistentPlant;
               if (!plant) return null;
               
               // For US plants, show the 6 required fields
               if (plant.country === 'US') {
                 const availableCapacity = plant.output;
                 const usedCapacity = plant.usedCapacity || 0;
                 const excessCapacity = availableCapacity - usedCapacity;
                 const capacityFactor = availableCapacity > 0 ? (usedCapacity / availableCapacity) * 100 : 0;
                 
                 return (
                   <>
                     <h3>{plant.name}</h3>
                     <p>Available Capacity: {availableCapacity.toFixed(1)} MW</p>
                     <p>Source: {plant.source}</p>
                     <p>Used Capacity: {usedCapacity.toFixed(1)} MW</p>
                     <p>Excess Capacity: {excessCapacity.toFixed(1)} MW</p>
                     <p>Capacity Factor: {capacityFactor.toFixed(1)}%</p>
                     <p>Coordinates: {plant.coordinates[1].toFixed(4)}, {plant.coordinates[0].toFixed(4)}</p>

                     {/* Nearby Fiber Cables Section - Only show when persistent and fiber cables are loaded */}
                     {isTooltipPersistent && showFiberCables && (
                       <div style={{ 
                         marginTop: '24px', 
                         paddingTop: '20px', 
                         borderTop: '2px solid rgba(200, 0, 200, 0.3)',
                         marginBottom: '10px'
                       }}>
                         <div style={{ 
                           marginBottom: '16px', 
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'space-between'
                         }}>
                           <h4 style={{ 
                             fontSize: '16px', 
                             fontWeight: '600',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '8px',
                             margin: 0
                           }}>
                             <span style={{ color: '#c800c8', fontSize: '20px' }}>📡</span>
                             Nearby Fiber Cables
                           </h4>
                           {!isCalculatingNearbyFiber && (
                             <span style={{ 
                               fontSize: '14px',
                               fontWeight: '500',
                               color: '#c800c8',
                               backgroundColor: 'rgba(200, 0, 200, 0.15)',
                               padding: '4px 10px',
                               borderRadius: '12px'
                             }}>
                               {nearbyFiberCables.length} found
                             </span>
                           )}
                         </div>
                         {isCalculatingNearbyFiber ? (
                           <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                             Calculating...
                           </p>
                         ) : nearbyFiberCables.length > 0 ? (
                           <div style={{ 
                             maxHeight: '300px', 
                             overflowY: 'auto',
                             display: 'flex',
                             flexDirection: 'column',
                             gap: '10px'
                           }}>
                             {nearbyFiberCables.map((cable, idx) => {
                               const p = cable.properties as Record<string, unknown>;
                               return (
                                 <div 
                                   key={cable.id || idx}
                                   onClick={() => {
                                     setHoveredFiberCable(cable);
                                     setIsFiberTooltipPersistent(true);
                                     setPersistentFiberCable(cable);
                                   }}
                                   style={{
                                     padding: '12px',
                                     backgroundColor: 'rgba(200, 0, 200, 0.1)',
                                     borderRadius: '6px',
                                     border: '1px solid rgba(200, 0, 200, 0.3)',
                                     fontSize: '13px',
                                     cursor: 'pointer',
                                     transition: 'all 0.2s',
                                     display: 'flex',
                                     flexDirection: 'column',
                                     gap: '6px'
                                   }}
                                   onMouseEnter={(e) => {
                                     e.currentTarget.style.backgroundColor = 'rgba(200, 0, 200, 0.2)';
                                     e.currentTarget.style.borderColor = 'rgba(200, 0, 200, 0.5)';
                                   }}
                                   onMouseLeave={(e) => {
                                     e.currentTarget.style.backgroundColor = 'rgba(200, 0, 200, 0.1)';
                                     e.currentTarget.style.borderColor = 'rgba(200, 0, 200, 0.3)';
                                   }}
                                 >
                                   <div style={{ 
                                     fontWeight: '600', 
                                     fontSize: '14px',
                                     display: 'flex', 
                                     justifyContent: 'space-between', 
                                     alignItems: 'center',
                                     marginBottom: '4px'
                                   }}>
                                     <span style={{ color: '#fff' }}>
                                       {p.NAME ? String(p.NAME) : `Fiber Cable ${idx + 1}`}
                                     </span>
                                     <span style={{ 
                                       fontSize: '13px', 
                                       color: '#c800c8', 
                                       fontWeight: '700',
                                       backgroundColor: 'rgba(200, 0, 200, 0.2)',
                                       padding: '2px 8px',
                                       borderRadius: '10px'
                                     }}>
                                       {cable.distance.toFixed(2)} mi
                                     </span>
                                   </div>
                                   {p.OPERATOR != null && p.OPERATOR !== '' && (
                                     <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                       <strong>Operator:</strong> {String(p.OPERATOR)}
                                     </div>
                                   )}
                                   {p.SERVICE_TYPE != null && p.SERVICE_TYPE !== '' && (
                                     <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                       <strong>Service:</strong> {String(p.SERVICE_TYPE)}
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>
                         ) : (
                           <p style={{ 
                             color: 'rgba(255, 255, 255, 0.6)', 
                             fontSize: '14px',
                             textAlign: 'center',
                             padding: '20px',
                             fontStyle: 'italic'
                           }}>
                             No fiber cables found within 5 miles
                           </p>
                         )}
                       </div>
                     )}
                   </>
                 );
               }
               
               // For other countries, show the original format
               return (
                 <>
                   <h3>{plant.name}</h3>
                   <p>Output: {plant.outputDisplay}</p>
                   <p>Source: {plant.source}</p>
                   {/* Show used capacity for global database plants (India, Kazakhstan, Kyrgyzstan, UAE) */}
                   {plant.usedCapacity && (plant.country === 'IN' || plant.country === 'KZ' || plant.country === 'KG' || plant.country === 'AE') && (
                     <p>Used Capacity: {plant.usedCapacity.toFixed(1)} MW</p>
                   )}
                   {plant.rawData?.technology && (
                     <p style={{ display: 'flex', alignItems: 'center' }}>
                       Technology: {plant.rawData.technology}
                       <span
                         style={{
                           display: 'inline-block',
                           width: '10px',
                           height: '10px',
                           borderRadius: '50%',
                           backgroundColor: `rgb(${POWER_PLANT_COLORS[plant.source]?.join(',') || '128,128,128'})`,
                           marginLeft: '8px'
                         }}
                       ></span>
                     </p>
                   )}
                   {plant.netSummerCapacity && <p>Net Summer Capacity: {plant.netSummerCapacity.toFixed(1)} MW</p>}
                   {plant.netWinterCapacity && <p>Net Winter Capacity: {plant.netWinterCapacity.toFixed(1)} MW</p>}

                   {/* Additional details from rawData - shown when persistent */}
                   {isTooltipPersistent && plant.rawData && (
                     <>
                       {plant.rawData['City (Site Name)'] && <p>City: {plant.rawData['City (Site Name)']}</p>}
                       {plant.rawData['State / Province / Territory'] && <p>State/Province: {plant.rawData['State / Province / Territory']}</p>}
                       {plant.rawData['County'] && <p>County: {plant.rawData['County']}</p>}
                       {plant.rawData['Owner Name (Company)'] && <p>Owner: {plant.rawData['Owner Name (Company)']}</p>}
                       {plant.rawData['Operator Name'] && <p>Operator: {plant.rawData['Operator Name']}</p>}
                       {plant.rawData['Address'] && <p>Address: {plant.rawData['Address']}</p>}
                       {plant.rawData['Zip Code / Postal Code'] && <p>Postal Code: {plant.rawData['Zip Code / Postal Code']}</p>}
                       <p>Coordinates: {plant.coordinates[1].toFixed(4)}, {plant.coordinates[0].toFixed(4)}</p>

                       {/* CTA Buttons */}
                       <div className="cta-buttons">
                         <button
                           onClick={() => handleGoogleSearch(
                             plant.name,
                             plant.source,
                             plant.rawData?.['Owner Name (Company)']
                           )}
                           aria-label={`Search for ${plant.name} powerplant on Google`}
                         >
                           <Search size={16} />
                           View on Google
                         </button>
                         <button
                           onClick={() => handleGoogleMaps(plant.coordinates)}
                           aria-label={`View ${plant.name} location on Google Maps`}
                         >
                           <MapPin size={16} />
                           View on Google Maps
                         </button>
                       </div>
                     </>
                   )}

                   {/* Nearby Fiber Cables Section - Only show when persistent and fiber cables are loaded */}
                   {isTooltipPersistent && showFiberCables && (
                     <div style={{ 
                       marginTop: '24px', 
                       paddingTop: '20px', 
                       borderTop: '2px solid rgba(200, 0, 200, 0.3)',
                       marginBottom: '10px'
                     }}>
                       <div style={{ 
                         marginBottom: '16px', 
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'space-between'
                       }}>
                         <h4 style={{ 
                           fontSize: '16px', 
                           fontWeight: '600',
                           display: 'flex',
                           alignItems: 'center',
                           gap: '8px',
                           margin: 0
                         }}>
                           <span style={{ color: '#c800c8', fontSize: '20px' }}>📡</span>
                           Nearby Fiber Cables
                         </h4>
                         {!isCalculatingNearbyFiber && (
                           <span style={{ 
                             fontSize: '14px',
                             fontWeight: '500',
                             color: '#c800c8',
                             backgroundColor: 'rgba(200, 0, 200, 0.15)',
                             padding: '4px 10px',
                             borderRadius: '12px'
                           }}>
                             {nearbyFiberCables.length} found
                           </span>
                         )}
                       </div>
                       {isCalculatingNearbyFiber ? (
                         <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                           Calculating...
                         </p>
                       ) : nearbyFiberCables.length > 0 ? (
                         <div style={{ 
                           maxHeight: '300px', 
                           overflowY: 'auto',
                           display: 'flex',
                           flexDirection: 'column',
                           gap: '10px'
                         }}>
                           {nearbyFiberCables.map((cable, idx) => {
                             const p = cable.properties as Record<string, unknown>;
                             return (
                               <div 
                                 key={cable.id || idx}
                                 onClick={() => {
                                   setHoveredFiberCable(cable);
                                   setIsFiberTooltipPersistent(true);
                                   setPersistentFiberCable(cable);
                                 }}
                                 style={{
                                   padding: '12px',
                                   backgroundColor: 'rgba(200, 0, 200, 0.1)',
                                   borderRadius: '6px',
                                   border: '1px solid rgba(200, 0, 200, 0.3)',
                                   fontSize: '13px',
                                   cursor: 'pointer',
                                   transition: 'all 0.2s',
                                   display: 'flex',
                                   flexDirection: 'column',
                                   gap: '6px'
                                 }}
                                 onMouseEnter={(e) => {
                                   e.currentTarget.style.backgroundColor = 'rgba(200, 0, 200, 0.2)';
                                   e.currentTarget.style.borderColor = 'rgba(200, 0, 200, 0.5)';
                                 }}
                                 onMouseLeave={(e) => {
                                   e.currentTarget.style.backgroundColor = 'rgba(200, 0, 200, 0.1)';
                                   e.currentTarget.style.borderColor = 'rgba(200, 0, 200, 0.3)';
                                 }}
                               >
                                 <div style={{ 
                                   fontWeight: '600', 
                                   fontSize: '14px',
                                   display: 'flex', 
                                   justifyContent: 'space-between', 
                                   alignItems: 'center',
                                   marginBottom: '4px'
                                 }}>
                                   <span style={{ color: '#fff' }}>
                                     {p.NAME ? String(p.NAME) : `Fiber Cable ${idx + 1}`}
                                   </span>
                                   <span style={{ 
                                     fontSize: '13px', 
                                     color: '#c800c8', 
                                     fontWeight: '700',
                                     backgroundColor: 'rgba(200, 0, 200, 0.2)',
                                     padding: '2px 8px',
                                     borderRadius: '10px'
                                   }}>
                                     {cable.distance.toFixed(2)} mi
                                   </span>
                                 </div>
                                 {p.OPERATOR != null && p.OPERATOR !== '' && (
                                   <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                     <strong>Operator:</strong> {String(p.OPERATOR)}
                                   </div>
                                 )}
                                 {p.SERVICE_TYPE != null && p.SERVICE_TYPE !== '' && (
                                   <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                     <strong>Service:</strong> {String(p.SERVICE_TYPE)}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                       ) : (
                         <p style={{ 
                           color: 'rgba(255, 255, 255, 0.6)', 
                           fontSize: '14px',
                           textAlign: 'center',
                           padding: '20px',
                           fontStyle: 'italic'
                         }}>
                           No fiber cables found within 5 miles
                         </p>
                       )}
                     </div>
                   )}
                 </>
               );
             })()}
           </div>
          )}

          {/* HIFLD Transmission Line Info Panel */}
          {(hoveredLine || (isLineTooltipPersistent && persistentLine)) && (
            <div className="info-panel line-panel">
            {/* Close button only when persistent */}
            {isLineTooltipPersistent && (
              <button
                className="close-button"
                onClick={() => {
                  setIsLineTooltipPersistent(false);
                  setHoveredLine(null);
                  setPersistentLine(null);
                }}
                aria-label="Close tooltip"
              >
                <X size={16} />
              </button>
            )}
            {(() => {
              const line = hoveredLine || persistentLine;
              if (!line) return null;

              const lineId = line.properties.id || line.properties.ID;
              const owner = line.properties.owner || line.properties.OWNER;
              const voltage = line.properties.voltage || line.properties.VOLTAGE;
              const voltClass = line.properties.voltClass || line.properties.VOLT_CLASS;
              const lineType = line.properties.type || line.properties.TYPE;
              const status = line.properties.status || line.properties.STATUS;
              const sub1 = line.properties.sub1 || line.properties.SUB_1;
              const sub2 = line.properties.sub2 || line.properties.SUB_2;
              
              // Convert meters to kilometers for better readability
              const lengthKm = line.properties.shapeLength 
                ? (line.properties.shapeLength / 1000).toFixed(2) 
                : null;
              
              return (
                <>
                  <h3>Transmission Line</h3>
                  {lineId && (
                    <p><strong>ID:</strong> {lineId}</p>
                  )}
                  {owner && (
                    <p><strong>Owner:</strong> {owner}</p>
                  )}
                  {voltage && (
                    <p><strong>Voltage:</strong> {voltage} kV</p>
                  )}
                  {voltClass && (
                    <p><strong>Voltage Class:</strong> {voltClass} kV</p>
                  )}
                  {lineType && (
                    <p><strong>Type:</strong> {lineType}</p>
                  )}
                  {status && (
                    <p><strong>Status:</strong> {status}</p>
                  )}
                  {lengthKm && (
                    <p><strong>Length:</strong> {lengthKm} km ({line.properties.shapeLength?.toFixed(0)} m)</p>
                  )}
                  {sub1 && (
                    <p><strong>Substation 1:</strong> {sub1}</p>
                  )}
                  {sub2 && (
                    <p><strong>Substation 2:</strong> {sub2}</p>
                  )}
                  {line.coordinates && line.coordinates.length > 0 && (
                    <p><strong>Start:</strong> {line.coordinates[0][1].toFixed(4)}, {line.coordinates[0][0].toFixed(4)}</p>
                  )}
                  {line.coordinates && line.coordinates.length > 1 && (
                    <p><strong>End:</strong> {line.coordinates[line.coordinates.length - 1][1].toFixed(4)}, {line.coordinates[line.coordinates.length - 1][0].toFixed(4)}</p>
                  )}
                  {line.coordinates && line.coordinates.length > 2 && (
                    <p><strong>Coordinate Points:</strong> {line.coordinates.length}</p>
                  )}
                </>
              );
            })()}
          </div>
          )}

          {/* Fiber Cable Info Panel */}
          {(hoveredFiberCable || (isFiberTooltipPersistent && persistentFiberCable)) && (
            <div className="info-panel line-panel">
              {isFiberTooltipPersistent && (
                <button
                  className="close-button"
                  onClick={() => {
                    setIsFiberTooltipPersistent(false);
                    setHoveredFiberCable(null);
                    setPersistentFiberCable(null);
                  }}
                  aria-label="Close tooltip"
                >
                  <X size={16} />
                </button>
              )}
              {(() => {
                // Show persistent cable if set, otherwise show hovered cable
                const fiber = (isFiberTooltipPersistent && persistentFiberCable) ? persistentFiberCable : hoveredFiberCable;
                if (!fiber) return null;
                const p = fiber.properties as Record<string, unknown>;
                return (
                  <>
                    <h3>Fiber Cable</h3>
                    {p.NAME != null && p.NAME !== '' && <p><strong>Name:</strong> {String(p.NAME)}</p>}
                    {p.OPERATOR != null && p.OPERATOR !== '' && <p><strong>Operator:</strong> {String(p.OPERATOR)}</p>}
                    {p.OWNER != null && p.OWNER !== '' && <p><strong>Owner:</strong> {String(p.OWNER)}</p>}
                    {p.TYPE != null && p.TYPE !== '' && <p><strong>Type:</strong> {String(p.TYPE)}</p>}
                    {p.STATUS != null && p.STATUS !== '' && <p><strong>Status:</strong> {String(p.STATUS)}</p>}
                    {p.SERVICE_TYPE != null && p.SERVICE_TYPE !== '' && <p><strong>Service Type:</strong> {String(p.SERVICE_TYPE)}</p>}
                    {p.MILES != null && <p><strong>Length:</strong> {Number(p.MILES).toFixed(2)} miles</p>}
                    {p.STATE_NAME != null && p.STATE_NAME !== '' && <p><strong>State:</strong> {String(p.STATE_NAME)}</p>}
                    {p.CNTY_NAME != null && p.CNTY_NAME !== '' && <p><strong>County:</strong> {String(p.CNTY_NAME)}</p>}
                    {p.CNTRY_NAME != null && p.CNTRY_NAME !== '' && <p><strong>Country:</strong> {String(p.CNTRY_NAME)}</p>}
                    {p.QUALITY != null && p.QUALITY !== '' && <p><strong>Quality:</strong> {String(p.QUALITY)}</p>}
                    {p.LOC_ID != null && p.LOC_ID !== '' && <p><strong>ID:</strong> {String(p.LOC_ID)}</p>}
                    {fiber.path && fiber.path.length > 0 && (
                      <p><strong>Start:</strong> {fiber.path[0][1].toFixed(4)}, {fiber.path[0][0].toFixed(4)}</p>
                    )}
                    {fiber.path && fiber.path.length > 1 && (
                      <p><strong>End:</strong> {fiber.path[fiber.path.length - 1][1].toFixed(4)}, {fiber.path[fiber.path.length - 1][0].toFixed(4)}</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
    </div>
  );
}

const AppWrapper: React.FC = () => (
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

export default AppWrapper;
