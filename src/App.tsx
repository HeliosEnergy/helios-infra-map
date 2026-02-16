import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Map, { NavigationControl } from 'react-map-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, PolygonLayer, IconLayer } from '@deck.gl/layers';
import './App.css';
import type { PowerPlant } from './models/PowerPlant';
import type { Cable } from './models/Cable';
import type { TransmissionLine } from './models/TransmissionLine';

import { loadWfsCableData } from './utils/wfsDataLoader';
import { loadHifldData } from './utils/hifldDataLoader';
import { HifldCache } from './utils/cache';
import { loadAndProcessAllPowerPlants } from './utils/unifiedPowerPlantProcessor';
import { isPointNearLine, generateCirclePolygon, calculateDistance } from './utils/geoUtils';
import { LOCATION_PIN_ICON } from './utils/locationPinIcon';
import type { LineSegment } from './utils/spatialIndex';
import { createLineIndex, queryLineIndex } from './utils/spatialIndex';
import { calculatePowerRange, type PowerRange } from './utils/powerRangeCalculator';
import { calculateBbox } from './utils/bboxUtils';
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

// SizeByOption type as per MAP_FEATURES_DOCUMENTATION.md
type SizeByOption = 'nameplate_capacity' | 'capacity_factor' | 'generation';

type FiberCable = {
  id: string;
  path: [number, number][];
  properties: Record<string, unknown>;
};

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

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

// Define color mapping for power plant sources
const POWER_PLANT_COLORS: Record<string, [number, number, number]> = {
  'hydro': [31, 119, 180],      // Blue (water-based energy)
  'gas': [255, 127, 14],        // Orange (gas)
  'wind': [44, 160, 44],        // Green (wind)
  'nuclear': [214, 39, 40],     // Red (nuclear)
  'coal': [64, 64, 64],         // Dark gray (coal)
  'solar': [255, 215, 0],       // Yellow (solar)
  'oil': [128, 128, 128],       // Medium gray (oil)
  'biomass': [100, 180, 50],    // Vibrant green (biomass)
  'battery': [128, 0, 128],     // Purple (battery/storage)
  'diesel': [192, 192, 192],    // Light gray (diesel)
  'geothermal': [160, 32, 240], // Violet (geothermal)
  'tidal': [0, 191, 255],       // Sky blue (tidal)
  'waste': [139, 69, 19],       // Saddle brown (waste)
  'biofuel': [210, 180, 140],   // Tan (biofuel)
  'other': [148, 103, 189]      // Purple (other)
};

// Orange color for cables
const CABLE_COLOR: [number, number, number] = [255, 165, 0]; // Orange color

function App() {
  const { theme } = useTheme();
  const [powerPlants, setPowerPlants] = useState<PowerPlant[]>([]);
  const [wfsCables, setWfsCables] = useState<Cable[]>([]);
  const [hifldLines, setHifldLines] = useState<TransmissionLine[]>([]);
  const [fiberCables, setFiberCables] = useState<FiberCable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showPowerPlants, setShowPowerPlants] = useState<boolean>(true);
  const [showWfsCables, setShowWfsCables] = useState<boolean>(true);
  const [showHifldLines, setShowHifldLines] = useState<boolean>(false);
  const [showFiberCables, setShowFiberCables] = useState<boolean>(true);
  const [loadingFiberCables, setLoadingFiberCables] = useState<boolean>(false);
  const [loadingHifld, setLoadingHifld] = useState<boolean>(false);
  const [hifldLoadingMessage, setHifldLoadingMessage] = useState<string>('Loading HIFLD transmission lines...');
  const [hifldProgress, setHifldProgress] = useState<number>(0);
  const [hifldProgressCount, setHifldProgressCount] = useState<number>(0);
  const [showHifldSuccessMessage, setShowHifldSuccessMessage] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<PowerPlant | null>(null);
  const [hoveredLine, setHoveredLine] = useState<TransmissionLine | null>(null);
  const [locationPinHoverInfo, setLocationPinHoverInfo] = useState<{ x: number; y: number; address: string } | null>(null);
  // State for persistent tooltip for transmission lines
  const [isLineTooltipPersistent, setIsLineTooltipPersistent] = useState<boolean>(false);
  const [persistentLine, setPersistentLine] = useState<TransmissionLine | null>(null);
  // State for fiber cable hover and persistent tooltip
  const [hoveredFiberCable, setHoveredFiberCable] = useState<FiberCable | null>(null);
  const [isFiberTooltipPersistent, setIsFiberTooltipPersistent] = useState<boolean>(false);
  const [persistentFiberCable, setPersistentFiberCable] = useState<FiberCable | null>(null);
  // State for nearby fiber cables for selected power plant (with distance)
  const [nearbyFiberCables, setNearbyFiberCables] = useState<Array<FiberCable & { distance: number }>>([]);
  const [isCalculatingNearbyFiber, setIsCalculatingNearbyFiber] = useState<boolean>(false);
  // Ref for hover timeout to delay tooltip hiding
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fiberHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // State for filtering power plants by source
  const [filteredSources, setFilteredSources] = useState<Set<string>>(new Set());
  // State for power output range filtering (0 MW to 10000 MW)
  const [minPowerOutput, setMinPowerOutput] = useState<number>(0);
  const [maxPowerOutput, setMaxPowerOutput] = useState<number>(10000);
  // State for capacity factor range filtering (0% to 100%)
  const [minCapacityFactor, setMinCapacityFactor] = useState<number>(0);
  const [maxCapacityFactor, setMaxCapacityFactor] = useState<number>(100);
  // State for country filtering - Dynamic approach
  const [showCanadianPlants, setShowCanadianPlants] = useState<boolean>(true);
  const [showAmericanPlants, setShowAmericanPlants] = useState<boolean>(true);
  const [showKazakhstanPlants, setShowKazakhstanPlants] = useState<boolean>(true);
  const [showUaePlants, setShowUaePlants] = useState<boolean>(true);
  const [showIndiaPlants, setShowIndiaPlants] = useState<boolean>(true);
  const [showKyrgyzstanPlants, setShowKyrgyzstanPlants] = useState<boolean>(true);
  
  // Dynamic country filtering - use a Set to track enabled countries
  const [enabledCountries, setEnabledCountries] = useState<Set<string>>(new Set());
  const [allCountries, setAllCountries] = useState<Array<{code: string, name: string, count: number}>>([]);
  // State for proximity filtering
  const [showOnlyNearbyPlants, setShowOnlyNearbyPlants] = useState<boolean>(false);
    // State for proximity distance
    const [proximityDistance, setProximityDistance] = useState<number>(0); // Changed from 10 to 0 miles
    const [sliderValue, setSliderValue] = useState<number>(0);
    const debouncedDistance = useDebounce(sliderValue, 300); // 300ms debounce for expensive operations only

    // Update proximity distance immediately for real-time slider feedback
    useEffect(() => {
      setProximityDistance(sliderValue);
    }, [sliderValue]);

    // Callback for slider changes (immediate response)
    const handleSliderChange = useCallback((value: number) => {
      setSliderValue(value);
    }, []);
  const [lineIndex, setLineIndex] = useState<RBush<LineSegment> | null>(null);
   const [powerRange, setPowerRange] = useState<PowerRange>({ min: 0, max: 10000 });
   // Circle sizing state variables as per MAP_FEATURES_DOCUMENTATION.md
   const [sizeMultiplier, setSizeMultiplier] = useState<number>(2);
    const [capacityWeight, setCapacityWeight] = useState<number>(1);
    const [sizeByOption, setSizeByOption] = useState<SizeByOption>('nameplate_capacity');
      // State for persistent tooltip
      const [isTooltipPersistent, setIsTooltipPersistent] = useState<boolean>(false);
      const [persistentPlant, setPersistentPlant] = useState<PowerPlant | null>(null);
     // State for proximity dialog
     const [isProximityDialogOpen, setIsProximityDialogOpen] = useState<boolean>(false);
  // State for status filtering
  const [allStatuses, setAllStatuses] = useState<string[]>([]);
  const [filteredStatuses, setFilteredStatuses] = useState<Set<string>>(new Set());

  // State for plant search and selection
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  
  // State for map view state (for address search)
  const [viewState, setViewState] = useState({
    longitude: -95,
    latitude: 40,
    zoom: 3,
    pitch: 0,
    bearing: 0
  });
  
  // State for selected location (for stats panel)
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    addressName: string;
  } | null>(null);
  const [locationRadius, setLocationRadius] = useState<number>(5); // Default 5 miles
  const [isStatsPanelCollapsed, setIsStatsPanelCollapsed] = useState<boolean>(false);
  const [showRadiusCircle, setShowRadiusCircle] = useState<boolean>(false); // Hide circle by default

  // Toggle source filter
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

  // Select all sources
  const selectAllSources = () => {
    const allSources = Array.from(new Set(powerPlants.map(plant => plant.source)));
    setFilteredSources(new Set(allSources));
  };

  // Deselect all sources
  const deselectAllSources = () => {
    setFilteredSources(new Set());
  };
  // Toggle status filter
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

  // Toggle country filter
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

  // Handlers for plant search and selection
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

  const handleApplySelection = () => {
    // Selection is automatically applied through state update
    // This function is kept for compatibility with the existing interface
  };

  // CTA handler functions
  const handleGoogleSearch = (plantName: string, source?: string, owner?: string) => {
     // Build search query with context: name + source + owner + "powerplant"
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

  // Handler for address search - zooms map to selected location
  const handleLocationSelect = useCallback((coordinates: [number, number], zoom: number, addressName: string) => {
    const [lng, lat] = coordinates;
    setViewState({
      longitude: lng,
      latitude: lat,
      zoom: zoom,
      pitch: 0,
      bearing: 0
    });
    setSelectedLocation({
      coordinates: [lng, lat],
      addressName
    });
  }, []);

  // Pre-load HIFLD data in background on app start (for instant loading later)
  useEffect(() => {
    // Start loading HIFLD data immediately in background
    // This ensures data is cached and ready when user enables the toggle
    // We don't set state here - just cache the data for instant retrieval later
    loadHifldData(
      (freshData) => {
        // When fresh data arrives in background, update state if toggle is already enabled
        setHifldLines((currentLines) => {
          // Only update if we don't have data yet or if toggle is enabled
          if (currentLines.length === 0 && showHifldLines) {
            console.log(`✅ Background HIFLD data refreshed: ${freshData.length} lines`);
            return freshData;
          }
          return currentLines;
        });
      },
      (progress, message, count) => {
        // Only show progress if toggle is enabled and we're actively loading
        if (showHifldLines && hifldLines.length === 0) {
          setHifldProgress(progress);
          setHifldLoadingMessage(message);
          setHifldProgressCount(count);
        }
      }
    ).then((data) => {
      // Cache is now ready - data will be retrieved instantly when toggle is enabled
      if (data.length > 0) {
        console.log(`✅ HIFLD data pre-cached: ${data.length} lines (ready for instant display)`);
      }
    }).catch((error) => {
      console.warn('Background HIFLD pre-load failed (non-critical):', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - intentionally ignore dependencies

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load all power plant data using the new unified processor
        const powerPlantData = await loadAndProcessAllPowerPlants();

        // Load WFS submarine cable data (unchanged)
        const wfsCableData = await loadWfsCableData();

        // HIFLD data is pre-loaded in background (see useEffect above)

        // Add validation to check if we have sufficient data
        if (powerPlantData.length < 500) {
          console.warn(`Only loaded ${powerPlantData.length} power plants. This may indicate a data loading issue.`);
        }

        setPowerPlants(powerPlantData);
        setWfsCables(wfsCableData);
        // HIFLD lines are loaded asynchronously above, don't set here

        // Calculate actual power range from data
        const calculatedRange = calculatePowerRange(powerPlantData);
        setPowerRange(calculatedRange);

        // Update current filter values to fit within new range if needed
        setMinPowerOutput(prev => Math.max(calculatedRange.min, Math.min(prev, calculatedRange.max)));
        setMaxPowerOutput(prev => Math.min(calculatedRange.max, Math.max(prev, calculatedRange.min)));

        // Create spatial index for submarine cables only (removed terrestrial links)
        const index = createLineIndex(wfsCableData);
        setLineIndex(index);

        // Initialize filtered sources with all unique sources from the data
        const uniqueSources = new Set(powerPlantData.map(plant => plant.source));
        console.log('Unique sources in data:', Array.from(uniqueSources));
        setFilteredSources(new Set(Array.from(uniqueSources)));
        
        // Extract and set all unique statuses
        const statuses = new Set(powerPlantData.map(p => p.rawData?.statusDescription || 'N/A'));
        const sortedStatuses = Array.from(statuses).sort();
        setAllStatuses(sortedStatuses);
        setFilteredStatuses(new Set(sortedStatuses));

        // Extract and set all countries with counts and used capacity
        const countryData: Record<string, {count: number, usedCapacity: number}> = {};
        powerPlantData.forEach(plant => {
          if (!countryData[plant.country]) {
            countryData[plant.country] = { count: 0, usedCapacity: 0 };
          }
          countryData[plant.country].count += 1;
          
          // Add used capacity if available (for global database plants, including US)
          if (plant.usedCapacity && plant.country !== 'CA') {
            countryData[plant.country].usedCapacity += plant.usedCapacity;
          }
        });
        
        const countriesList = Object.entries(countryData)
          .map(([code, data]) => ({
            code,
            name: getCountryName(code),
            count: data.count,
            usedCapacity: data.usedCapacity > 0 ? data.usedCapacity : undefined
          }))
          .sort((a, b) => b.count - a.count); // Sort by count descending
        
        setAllCountries(countriesList);
        
        // Initialize enabled countries with US only (default) - Canada will be shown only if user selects it
        setEnabledCountries(new Set(['US']));
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Filter power plants based on selected sources, countries, power output range, proximity, status, and selected plant IDs
  const filteredPowerPlants = powerPlants.filter(plant => {
    // Existing source filtering
    const passesSourceFilter = filteredSources.has(plant.source);
    
    // Dynamic country filtering - if no countries are selected, show all (empty set means show all)
    const passesCountryFilter = enabledCountries.size === 0 || enabledCountries.has(plant.country);
    
    // New power output range filtering
    const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

    // Capacity factor filtering
    const plantCapacityFactor = plant.capacityFactor ?? null;
    const passesCapacityFactorFilter = plantCapacityFactor === null || 
      (plantCapacityFactor >= minCapacityFactor && plantCapacityFactor <= maxCapacityFactor);

    // Status filtering - if no statuses are selected, show all (empty set means show all)
    const plantStatus = plant.rawData?.statusDescription || 'N/A';
    const passesStatusFilter = filteredStatuses.size === 0 || filteredStatuses.has(plantStatus);

    // Plant selection filtering - if any plants are selected, only show those
    const passesPlantSelectionFilter = selectedPlantIds.size === 0 || selectedPlantIds.has(plant.id);

    // New "nearby plants" filtering - check against submarine cables only (removed terrestrial links)
    let passesNearbyFilter = true;
    if (showOnlyNearbyPlants && lineIndex) {
      const nearbySegments = queryLineIndex(lineIndex, plant.coordinates, proximityDistance);
      passesNearbyFilter = false;
      for (const segment of nearbySegments) {
        if (isPointNearLine(plant.coordinates, segment, proximityDistance)) {
          passesNearbyFilter = true;
          break;
        }
      }
    }

    return passesSourceFilter && passesCountryFilter && passesPowerOutputFilter && passesCapacityFactorFilter && passesNearbyFilter && passesStatusFilter && passesPlantSelectionFilter;
  });
  

  // Load HIFLD data when toggle is enabled - instant display with background refresh
  useEffect(() => {
    if (showHifldLines && hifldLines.length === 0 && !loadingHifld) {
      // Show loading indicator immediately
      setLoadingHifld(true);
      
      // Check if we have cached data first (synchronous localStorage check for instant display)
      const quickCacheCheck = HifldCache.get();
      if (quickCacheCheck && quickCacheCheck.length >= 100) {
        // We have cached data - show it instantly
        console.log(`✅ Displaying cached HIFLD data instantly: ${quickCacheCheck.length} lines`);
        setHifldLines(quickCacheCheck);
        setLoadingHifld(false);
        setHifldLoadingMessage('Loading HIFLD transmission lines...');
        
        // Load fresh data in background and update when ready
        setHifldLoadingMessage('Refreshing data in background...');
        setHifldProgress(0);
        loadHifldData(
          (freshData) => {
            console.log(`✅ Fresh HIFLD data received: ${freshData.length} lines`);
            setHifldLines(freshData);
            setHifldProgress(100);
          },
          (progress, message, count) => {
            setHifldProgress(progress);
            setHifldLoadingMessage(message);
            setHifldProgressCount(count);
          },
          (dataChunk) => {
            // Progressive update - add new lines as they arrive
            setHifldLines((currentLines) => {
              const existingIds = new Set(currentLines.map(line => line.id));
              const newLines = dataChunk.filter(line => !existingIds.has(line.id));
              return [...currentLines, ...newLines];
            });
          }
        ).catch((error) => {
          console.warn('Background refresh failed (non-critical):', error);
          setHifldProgress(0);
        });
        return;
      }
      
      // No cached data in localStorage - check IndexedDB and fetch if needed
      setHifldLoadingMessage('Loading HIFLD transmission lines...');
      setHifldProgress(1); // Start at 1% so progress bar is visible
      setHifldProgressCount(0);
      
      // Load with progress callback and progressive data chunks
      loadHifldData(
        (freshData) => {
          // This callback is called when fresh data arrives (after cached data is returned)
          console.log(`✅ Fresh HIFLD data received: ${freshData.length} lines`);
          setHifldLines(freshData);
          setLoadingHifld(false);
          setHifldProgress(100);
          setHifldLoadingMessage(`Loaded ${freshData.length} transmission lines`);
        },
        (progress, message, count) => {
          // Progress callback for fetch progress
          setHifldProgress(progress);
          setHifldLoadingMessage(message);
          setHifldProgressCount(count);
        },
        (dataChunk) => {
          // Progressive data chunk callback - add lines as they load
          setHifldLines((currentLines) => {
            // Merge new chunk with existing lines, avoiding duplicates
            const existingIds = new Set(currentLines.map(line => line.id));
            const newLines = dataChunk.filter(line => !existingIds.has(line.id));
            return [...currentLines, ...newLines];
          });
        }
      )
        .then((data) => {
          // This returns immediately with cached data (if available) or fresh data
          if (data.length > 0) {
            console.log(`✅ HIFLD data loaded: ${data.length} lines`);
            setHifldLines(data);
            setLoadingHifld(false);
            setHifldProgress(100);
            setHifldLoadingMessage(`Loaded ${data.length} transmission lines`);
          } else {
            // No data available
            console.log('⚠️ No HIFLD data available');
            setHifldLines([]);
            setLoadingHifld(false);
            setHifldProgress(0);
            setHifldLoadingMessage('No data available');
          }
        })
        .catch((error) => {
          console.error('❌ Failed to load HIFLD data:', error);
          setHifldLines([]);
          setLoadingHifld(false);
          setHifldProgress(0);
          setHifldLoadingMessage('Failed to load data');
        });
    }
  }, [showHifldLines, hifldLines.length, loadingHifld]);

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (!loadingHifld && hifldLines.length > 0 && showHifldLines) {
      // Show the success message
      setShowHifldSuccessMessage(true);
      
      // Hide it after 3 seconds
      const timer = setTimeout(() => {
        setShowHifldSuccessMessage(false);
      }, 3000);
      
      // Cleanup timer on unmount or when dependencies change
      return () => clearTimeout(timer);
    } else {
      // Hide message if loading starts again or toggle is turned off
      setShowHifldSuccessMessage(false);
    }
  }, [loadingHifld, hifldLines.length, showHifldLines]);

  // Cleanup hover timeout on unmount or when tooltip becomes persistent
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
  }, [isLineTooltipPersistent, isFiberTooltipPersistent]);

  // Calculate nearby fiber cables when a power plant is selected (5 mile radius) with distances
  useEffect(() => {
    const plant = persistentPlant;
    if (!plant || !showFiberCables || fiberCables.length === 0) {
      setNearbyFiberCables([]);
      setIsCalculatingNearbyFiber(false);
      return;
    }

    setIsCalculatingNearbyFiber(true);
    // Use setTimeout to avoid blocking UI
    const timeoutId = setTimeout(() => {
      const FIBER_RADIUS_MILES = 5;
      const nearby: Array<FiberCable & { distance: number }> = [];
      
      // Helper to calculate distance from point to line segment
      const distanceToSegment = (point: [number, number], segStart: [number, number], segEnd: [number, number]): number => {
        const [x, y] = point;
        const [x1, y1] = segStart;
        const [x2, y2] = segEnd;
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? dot / lenSq : -1;
        param = Math.max(0, Math.min(1, param));
        const xx = x1 + param * C;
        const yy = y1 + param * D;
        return calculateDistance(point, [xx, yy]);
      };
      
      // Check all loaded fiber cables and calculate distance
      for (const cable of fiberCables) {
        if (cable.path && cable.path.length > 0) {
          if (isPointNearLine(plant.coordinates, cable.path, FIBER_RADIUS_MILES)) {
            // Calculate minimum distance from plant to cable line segments
            let minDistance = Infinity;
            for (let i = 0; i < cable.path.length - 1; i++) {
              const segDistance = distanceToSegment(plant.coordinates, cable.path[i], cable.path[i + 1]);
              minDistance = Math.min(minDistance, segDistance);
            }
            // Also check distance to endpoints
            for (const point of cable.path) {
              const pointDistance = calculateDistance(plant.coordinates, point);
              minDistance = Math.min(minDistance, pointDistance);
            }
            nearby.push({ ...cable, distance: minDistance });
          }
        }
      }
      
      // Sort by distance (closest first)
      nearby.sort((a, b) => a.distance - b.distance);
      
      setNearbyFiberCables(nearby);
      setIsCalculatingNearbyFiber(false);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [persistentPlant, fiberCables, showFiberCables]);

  // Get all unique sources from the data for the legend
  const allSourcesInData = Array.from(new Set(powerPlants.map(plant => plant.source))).sort();

  // Calculate count of plants within proximity distance (using debounced value for performance)
  const proximityPlantCount = useMemo(() => {
    if (!showOnlyNearbyPlants || !lineIndex) return 0;

    return powerPlants.filter(plant => {
      // Check if plant passes other filters first
      const passesSourceFilter = filteredSources.has(plant.source);
      const passesCountryFilter =
    enabledCountries.has(plant.country);

      const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

      // Capacity factor filtering
      const plantCapacityFactor = plant.capacityFactor ?? null;
      const passesCapacityFactorFilter = plantCapacityFactor === null || 
        (plantCapacityFactor >= minCapacityFactor && plantCapacityFactor <= maxCapacityFactor);

      if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter || !passesCapacityFactorFilter) {
        return false;
      }

      // Check proximity to submarine cables only (removed terrestrial links)
      const nearbySegments = queryLineIndex(lineIndex, plant.coordinates, debouncedDistance);
      for (const segment of nearbySegments) {
        if (isPointNearLine(plant.coordinates, segment, debouncedDistance)) {
          return true;
        }
      }
      return false;
    }).length;
  }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, showUaePlants, showIndiaPlants, showKyrgyzstanPlants, minPowerOutput, maxPowerOutput, minCapacityFactor, maxCapacityFactor, enabledCountries]);

  // Get the actual list of nearby plants for the dialog (using debounced distance)
  const nearbyPlants = useMemo(() => {
    if (!showOnlyNearbyPlants || !lineIndex) return [];

    return powerPlants.filter(plant => {
      // Check if plant passes other filters first
      const passesSourceFilter = filteredSources.has(plant.source);
      const passesCountryFilter =
    enabledCountries.has(plant.country);

      const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

      // Capacity factor filtering
      const plantCapacityFactor = plant.capacityFactor ?? null;
      const passesCapacityFactorFilter = plantCapacityFactor === null || 
        (plantCapacityFactor >= minCapacityFactor && plantCapacityFactor <= maxCapacityFactor);

      if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter || !passesCapacityFactorFilter) {
        return false;
      }

      // Check proximity to submarine cables only (removed terrestrial links)
      const nearbySegments = queryLineIndex(lineIndex, plant.coordinates, debouncedDistance);
      for (const segment of nearbySegments) {
        if (isPointNearLine(plant.coordinates, segment, debouncedDistance)) {
          return true;
        }
      }
      return false;
    });
  }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, showUaePlants, showIndiaPlants, showKyrgyzstanPlants, minPowerOutput, maxPowerOutput, minCapacityFactor, maxCapacityFactor, enabledCountries]);

  // Helper: parse GeoJSON features into FiberCable[]
  const parseFiberFeatures = useCallback((features: any[], idPrefix: string): FiberCable[] => {
    const cables: FiberCable[] = [];
    features.forEach((feature: any, featureIndex: number) => {
      const geometry = feature?.geometry;
      const properties = feature?.properties ?? {};
      if (!geometry || !geometry.type || !geometry.coordinates) return;
      if (geometry.type === 'LineString') {
        cables.push({
          id: (properties.id as string) ?? `${idPrefix}-${featureIndex}`,
          path: geometry.coordinates as [number, number][],
          properties,
        });
      } else if (geometry.type === 'MultiLineString') {
        (geometry.coordinates as [number, number][][]).forEach((segment, segmentIndex) => {
          cables.push({
            id: (properties.id as string) ? `${properties.id}-${segmentIndex}` : `${idPrefix}-${featureIndex}-${segmentIndex}`,
            path: segment,
            properties,
          });
        });
      }
    });
    return cables;
  }, []);

  // Load detailed fiber cables when zoomed in (viewport-based)
  useEffect(() => {
    if (!showFiberCables) {
      setFiberCables([]);
      return;
    }
    if (viewState.zoom < 4) {
      setFiberCables([]);
      return;
    }

    const [minLon, minLat, maxLon, maxLat] = calculateBbox(
      viewState.longitude,
      viewState.latitude,
      viewState.zoom
    );

    let cancelled = false;
    setLoadingFiberCables(true);

    const loadFiberCables = async () => {
      try {
        const params = new URLSearchParams({
          minLon: minLon.toString(),
          minLat: minLat.toString(),
          maxLon: maxLon.toString(),
          maxLat: maxLat.toString(),
        });
        const response = await fetch(`/api/fiber-bbox?${params.toString()}`);
        if (!response.ok || cancelled) throw new Error(`Failed to load fiber cable data: ${response.statusText}`);
        const geojson = await response.json();
        const features = Array.isArray(geojson.features) ? geojson.features : [];
        const cables = parseFiberFeatures(features, 'fiber');
        // Cap client-side to prevent memory crash (max 25k cables)
        const MAX_CABLES = 25000;
        if (!cancelled) setFiberCables(cables.length > MAX_CABLES ? cables.slice(0, MAX_CABLES) : cables);
      } catch (error) {
        if (!cancelled) console.error('Error loading fiber cables:', error);
      } finally {
        if (!cancelled) setLoadingFiberCables(false);
      }
    };

    const timeoutId = setTimeout(loadFiberCables, 300);
    return () => {
      clearTimeout(timeoutId);
      cancelled = true;
    };
  }, [showFiberCables, viewState.longitude, viewState.latitude, viewState.zoom, parseFiberFeatures]);

  // Count power plants by source
  const powerPlantCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    powerPlants.forEach(plant => {
      counts[plant.source] = (counts[plant.source] || 0) + 1;
    });
    // Add cable count
    counts['cables'] = wfsCables.length;
    return counts;
  }, [powerPlants, wfsCables]);

  // Generate circle polygon for selected location
  const locationCircle = useMemo(() => {
    if (!selectedLocation) return null;
    return generateCirclePolygon(selectedLocation.coordinates, locationRadius, 64);
  }, [selectedLocation, locationRadius]);

  // Auto-zoom to fit circle when radius changes - ensures full circle is always visible
  // Updates immediately to show full circle perimeter as radius changes
  useEffect(() => {
    if (!selectedLocation || !locationCircle) return;
    
    // Calculate bounding box of the circle
    const lons = locationCircle.map(p => p[0]);
    const lats = locationCircle.map(p => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    // Calculate center (use selected location center)
    const [centerLon, centerLat] = selectedLocation.coordinates;
    
    // Calculate the span of the circle in degrees
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    
    // Get viewport dimensions
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportSize = Math.min(viewportWidth, viewportHeight);
    
    // Calculate zoom based on span
    // At zoom 0: 360 degrees = 256 pixels
    // At zoom z: 360 degrees = 256 * 2^z pixels
    // We want the circle to fit in the viewport with padding
    
    const latRad = centerLat * Math.PI / 180;
    // Adjust for latitude - longitude degrees are smaller at higher latitudes
    const lonSpanAdjusted = lonSpan / Math.cos(latRad);
    const adjustedSpan = Math.max(latSpan, lonSpanAdjusted);
    
    // Calculate zoom with 60% padding to ensure full visibility including top and bottom
    const paddedSpan = adjustedSpan * 1.6;
    let zoom = Math.log2((viewportSize * 360) / (paddedSpan * 256));
    
    // Clamp zoom: minimum 10 so map automatically lands at a good "city" level and fiber always loads
    zoom = Math.max(10, Math.min(18, Math.round(zoom * 10) / 10));
    
    setViewState(prev => ({
      ...prev,
      longitude: centerLon,
      latitude: centerLat,
      zoom: zoom
    }));
  }, [selectedLocation, locationRadius, locationCircle]);

  const layers = useMemo(() => {
    const layerList = [
      // Location radius circle (render first so it's behind other layers)
      selectedLocation && locationCircle && showRadiusCircle && new PolygonLayer({
        id: 'location-radius-circle',
        data: [{
          polygon: locationCircle,
          center: selectedLocation.coordinates
        }],
        pickable: false,
        stroked: true,
        filled: true,
        wireframe: false,
        lineWidthMinPixels: 2,
        getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
        getFillColor: [59, 130, 246, 30], // Blue with 30/255 opacity (transparent)
        getLineColor: [59, 130, 246, 150], // Blue with more opacity for border
        getLineWidth: 2,
        updateTriggers: {
          getPolygon: [locationCircle],
        },
      }),
      // Location pin marker (always visible when location is selected)
      // Rendered after circle but before other layers so it's visible on top
      selectedLocation && new IconLayer({
        id: 'location-pin',
        data: [{
          coordinates: selectedLocation.coordinates,
          addressName: selectedLocation.addressName
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
            mask: false
          }
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
              address: info.object.addressName
            });
          } else {
            setLocationPinHoverInfo(null);
          }
        },
      }),
      showPowerPlants && new ScatterplotLayer({
      id: 'power-plants',
      data: filteredPowerPlants,
      pickable: true,
      cursor: 'pointer',
      opacity: 0.8,
      filled: true,
      radiusUnits: 'pixels',           // ✅ keep in pixels
      radiusMinPixels: 2,
      radiusMaxPixels: 100,            // ✅ cap to avoid huge blobs
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

        // Sqrt-scale normalization for better variance
        const sqrtValue = Math.sqrt(Math.max(value, 1));
        const sqrtMin = Math.sqrt(Math.max(powerRange.min, 1));
        const sqrtMax = Math.sqrt(Math.max(powerRange.max, 1));
        const normalized =
          sqrtMax > sqrtMin ? (sqrtValue - sqrtMin) / (sqrtMax - sqrtMin) : 0;

        // Exaggerate sizing for capacity_factor due to small variance
        const exaggerationFactor = sizeByOption === 'capacity_factor' ? 5 : 1;
        // Final radius: adjusted base size + increased emphasis factor for more variance
        return sizeMultiplier * 2 + capacityWeight * normalized * 25 * exaggerationFactor;
      },
      updateTriggers: {
        getRadius: [sizeMultiplier, capacityWeight, sizeByOption, powerRange],
      },
      getFillColor: (d: PowerPlant) =>
        POWER_PLANT_COLORS[d.source] || POWER_PLANT_COLORS.other,
       onHover: (info: { object?: PowerPlant }) => setHoverInfo(info.object || null),
    }),
      showWfsCables && new PathLayer({
      id: 'wfs-cables',
      data: wfsCables,
      pickable: true,
      widthMinPixels: 1, // Thinner cables
      getPath: (d: Cable) => d.coordinates,
      getColor: CABLE_COLOR, // Orange color
      getWidth: 2, // Thinner cables
      onHover: () => {}
    }),
    // Fiber cables layer when zoomed in (viewport-based)
    showFiberCables && viewState.zoom >= 4 && fiberCables.length > 0 && new PathLayer({
      id: 'fiber-cables',
      data: fiberCables,
      pickable: true,
      widthMinPixels: 1,
      getPath: (d: FiberCable) => d.path,
      getColor: [200, 0, 200], // Magenta for fiber
      getWidth: 2,
      getPickingRadius: 45,
      autoHighlight: false,
      highlightColor: [255, 200, 0, 255],
      onHover: (info: { object?: FiberCable }) => {
        if (fiberHoverTimeoutRef.current) {
          clearTimeout(fiberHoverTimeoutRef.current);
          fiberHoverTimeoutRef.current = null;
        }
        if (info.object) {
          // Show hover tooltip, but don't clear persistent if it's set
          setHoveredFiberCable(info.object);
        } else {
          // Only hide hover tooltip if not persistent (persistent stays visible)
          if (!isFiberTooltipPersistent) {
            fiberHoverTimeoutRef.current = setTimeout(() => {
              setHoveredFiberCable(null);
              fiberHoverTimeoutRef.current = null;
            }, 2500);
          }
        }
      },
    }),
    showHifldLines && hifldLines.length > 0 && new PathLayer({
      id: 'hifld-lines',
      data: hifldLines,
      pickable: true,
      widthMinPixels: 1,
      widthMaxPixels: 3,
      widthScale: 1,
      widthUnits: 'pixels',
      
      // Performance optimizations
      autoHighlight: false, // Disable auto-highlight for better performance
      highlightColor: [255, 200, 0, 255],
      
      getPath: (d: TransmissionLine) => {
        if (!d.coordinates || d.coordinates.length === 0) {
          return [];
        }
        return d.coordinates;
      },
      
      getColor: (d: TransmissionLine) => {
        // Use simpler color calculation for better performance
        const voltage = d.properties?.voltage || d.properties?.VOLTAGE;
        const voltClass = d.properties?.voltClass || d.properties?.VOLT_CLASS;
        
        if (voltClass === '765' || voltClass === '500' || (voltage && voltage >= 500)) {
          return [0, 150, 255, 180]; // Slightly lower opacity for performance
        } else if (voltClass === '345' || voltClass === '230' || (voltage && voltage >= 230)) {
          return [50, 120, 200, 140];
        } else {
          return [100, 150, 200, 100]; // Lower opacity for lower voltage
        }
      },
      
      getWidth: (d: TransmissionLine) => {
        // Simplified width calculation for better performance
        const voltClass = d.properties?.voltClass || d.properties?.VOLT_CLASS;
        if (voltClass === '765' || voltClass === '500') return 1.2;
        if (voltClass === '345' || voltClass === '230') return 0.9;
        return 0.7;
      },
      
      getPickingRadius: 35, // Increased for much easier interaction
      opacity: 0.8, // Better visibility
      capRounded: false, // Disable rounded caps for better performance
      jointRounded: false, // Disable rounded joints for better performance
      billboard: false,
      
      // Performance: reduce update frequency
      updateTriggers: {
        data: hifldLines.length, // Only update on data length change
      },
      
      onHover: (info: { object?: TransmissionLine }) => {
        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        
        if (info.object) {
          // Immediately show tooltip when hovering (works like power plants)
          setHoveredLine(info.object);
        } else {
          // Add a delay before hiding tooltip
          hoverTimeoutRef.current = setTimeout(() => {
            setHoveredLine(null);
            hoverTimeoutRef.current = null;
          }, 1000); // 1000ms delay - gives user time to move mouse
        }
      },
    })
    ];
    
    const filteredLayers = layerList.filter(Boolean);
    return filteredLayers;
  }, [
    filteredPowerPlants,
    showPowerPlants,
    showWfsCables,
    wfsCables,
    showHifldLines,
    hifldLines,
    showFiberCables,
    fiberCables,
    isFiberTooltipPersistent,
    viewState.zoom,
    sizeMultiplier,
    capacityWeight,
    sizeByOption,
    setHoverInfo,
    powerRange,
    isLineTooltipPersistent,
    selectedLocation,
    locationCircle,
    showRadiusCircle,
  ]);

  return (
    <div className="app-container">
      <Header />
      {loading && (
        <div className="loading-indicator">
          Loading data...
        </div>
      )}
      
      {/* Data Warning Message */}
      {!loading && powerPlants.length < 500 && (
        <div className="data-warning">
          <AlertTriangle size={20} />
          <span>Warning: Only {powerPlants.length} power plants loaded. Data may be incomplete.</span>
        </div>
      )}
      
      {/* HIFLD Loading Indicator with Progress Bar */}
      {showHifldLines && (loadingHifld || hifldProgress > 0) && hifldLines.length === 0 && (
        <div className="data-warning" style={{ backgroundColor: 'rgba(0, 100, 200, 0.1)', borderColor: 'rgba(0, 100, 200, 0.3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⏳ {hifldLoadingMessage}</span>
              {hifldProgressCount > 0 && (
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                  {hifldProgressCount.toLocaleString()} lines
                </span>
              )}
            </div>
            <div style={{ 
              width: '100%', 
              height: '6px', 
              backgroundColor: 'rgba(0, 0, 0, 0.1)', 
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${hifldProgress}%`,
                height: '100%',
                backgroundColor: '#0066cc',
                transition: 'width 0.3s ease',
                borderRadius: '3px'
              }} />
            </div>
            {hifldProgress > 0 && (
              <div style={{ fontSize: '0.85rem', opacity: 0.7, textAlign: 'right' }}>
                {Math.round(hifldProgress)}%
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* HIFLD Data Status Message - Auto-hides after 3 seconds */}
      {showHifldSuccessMessage && (
        <div className="data-warning" style={{ backgroundColor: 'rgba(0, 150, 0, 0.1)', borderColor: 'rgba(0, 150, 0, 0.3)' }}>
          <span>✅ {hifldLines.length.toLocaleString()} transmission lines loaded and displayed.</span>
        </div>
      )}
      
      {/* Fiber Cables Loading Indicator */}
      {showFiberCables && loadingFiberCables && (
        <div className="data-warning" style={{ backgroundColor: 'rgba(200, 0, 200, 0.1)', borderColor: 'rgba(200, 0, 200, 0.3)' }}>
          <span>⏳ Loading fiber cables for current view...</span>
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
              setViewState({
                longitude: newViewState.longitude,
                latitude: newViewState.latitude,
                zoom: newViewState.zoom,
                pitch: (newViewState as any).pitch || 0,
                bearing: (newViewState as any).bearing || 0
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
              // Set both hover and persistent (works like power plants)
              setHoveredLine(info.object);
              setIsLineTooltipPersistent(true);
              setPersistentLine(info.object);
              return true;
            }
            if (info.object && info.layer?.id === 'fiber-cables') {
              event.stopPropagation();
              setHoveredFiberCable(info.object);
              setIsFiberTooltipPersistent(true);
              setPersistentFiberCable(info.object);
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
              
              // Convert meters to kilometers for better readability
              const lengthKm = line.properties.shapeLength 
                ? (line.properties.shapeLength / 1000).toFixed(2) 
                : null;
              
              return (
                <>
                  <h3>Transmission Line</h3>
                  {line.properties.id && (
                    <p><strong>ID:</strong> {line.properties.id}</p>
                  )}
                  {line.properties.owner && (
                    <p><strong>Owner:</strong> {line.properties.owner}</p>
                  )}
                  {line.properties.voltage && (
                    <p><strong>Voltage:</strong> {line.properties.voltage} kV</p>
                  )}
                  {line.properties.voltClass && (
                    <p><strong>Voltage Class:</strong> {line.properties.voltClass} kV</p>
                  )}
                  {line.properties.type && (
                    <p><strong>Type:</strong> {line.properties.type}</p>
                  )}
                  {line.properties.status && (
                    <p><strong>Status:</strong> {line.properties.status}</p>
                  )}
                  {lengthKm && (
                    <p><strong>Length:</strong> {lengthKm} km ({line.properties.shapeLength?.toFixed(0)} m)</p>
                  )}
                  {line.properties.sub1 && (
                    <p><strong>Substation 1:</strong> {line.properties.sub1}</p>
                  )}
                  {line.properties.sub2 && (
                    <p><strong>Substation 2:</strong> {line.properties.sub2}</p>
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