import { useState, useEffect, useMemo, useCallback } from 'react';
import Map, { NavigationControl } from 'react-map-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import './App.css';
import type { PowerPlant } from './models/PowerPlant';
import type { Cable } from './models/Cable';
import type { TransmissionLine } from './models/TransmissionLine';

import { loadWfsCableData } from './utils/wfsDataLoader';
import { loadHifldData } from './utils/hifldDataLoader';
import { loadAndProcessAllPowerPlants } from './utils/unifiedPowerPlantProcessor';
import { isPointNearLine } from './utils/geoUtils';
import type { LineSegment } from './utils/spatialIndex';
import { createLineIndex, queryLineIndex } from './utils/spatialIndex';
import { calculatePowerRange, type PowerRange } from './utils/powerRangeCalculator';
import RBush from 'rbush';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';
import SidePanel from './components/SidePanel';
import ProximityDialog from './components/ProximityDialog';
import { Search, MapPin, X, AlertTriangle } from 'lucide-react';

// SizeByOption type as per MAP_FEATURES_DOCUMENTATION.md
type SizeByOption = 'nameplate_capacity' | 'capacity_factor' | 'generation' | 'net_summer_capacity' | 'net_winter_capacity';

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
  const [loading, setLoading] = useState<boolean>(true);
  const [showPowerPlants, setShowPowerPlants] = useState<boolean>(true);
  const [showWfsCables, setShowWfsCables] = useState<boolean>(true);
  const [showHifldLines, setShowHifldLines] = useState<boolean>(false);
  const [loadingHifld, setLoadingHifld] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<PowerPlant | null>(null);
  const [hoveredLine, setHoveredLine] = useState<TransmissionLine | null>(null);
  // State for persistent tooltip for transmission lines
  const [isLineTooltipPersistent, setIsLineTooltipPersistent] = useState<boolean>(false);
  const [persistentLine, setPersistentLine] = useState<TransmissionLine | null>(null);
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
    const [showSummerCapacity, setShowSummerCapacity] = useState<boolean>(false);
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

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load all power plant data using the new unified processor
        const powerPlantData = await loadAndProcessAllPowerPlants();

        // Load WFS submarine cable data (unchanged)
        const wfsCableData = await loadWfsCableData();

        // HIFLD data will be loaded when toggle is enabled (on-demand loading)

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
        setFilteredSources(new Set(Array.from(uniqueSources).filter(source => source !== 'other')));
        
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
    const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
    
    // Dynamic country filtering
    const passesCountryFilter = enabledCountries.has(plant.country);
    
    // New power output range filtering
    const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

    // Capacity factor filtering
    const plantCapacityFactor = plant.capacityFactor ?? null;
    const passesCapacityFactorFilter = plantCapacityFactor === null || 
      (plantCapacityFactor >= minCapacityFactor && plantCapacityFactor <= maxCapacityFactor);

    // Status filtering
    const plantStatus = plant.rawData?.statusDescription || 'N/A';
    const passesStatusFilter = filteredStatuses.has(plantStatus);

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
  

  // Load HIFLD data when toggle is enabled
  useEffect(() => {
    if (showHifldLines && hifldLines.length === 0 && !loadingHifld) {
      setLoadingHifld(true);
      
      // Add a timeout to prevent infinite loading (210 seconds - allow time for many pages)
      const loadTimeout = setTimeout(() => {
        console.error('❌ HIFLD data loading timeout after 210 seconds');
        setLoadingHifld(false);
        setHifldLines([]);
      }, 210000); // 210 second max timeout (allows for 200s fetch + buffer)
      
      loadHifldData()
        .then((data) => {
          clearTimeout(loadTimeout);
          console.log(`✅ Loaded ${data.length} HIFLD transmission lines`);
          setHifldLines(data);
          if (data.length > 0) {
            console.log(`💡 HIFLD data ready - ${data.length} transmission lines available`);
          }
        })
        .catch((error) => {
          clearTimeout(loadTimeout);
          console.error('❌ Failed to load HIFLD data:', error);
          setHifldLines([]);
        })
        .finally(() => {
          clearTimeout(loadTimeout);
          setLoadingHifld(false);
        });
    }
  }, [showHifldLines, hifldLines.length, loadingHifld]);

  // Get all unique sources from the data for the legend
  const allSourcesInData = Array.from(new Set(powerPlants.map(plant => plant.source))).sort();

  // Calculate count of plants within proximity distance (using debounced value for performance)
  const proximityPlantCount = useMemo(() => {
    if (!showOnlyNearbyPlants || !lineIndex) return 0;

    return powerPlants.filter(plant => {
      // Check if plant passes other filters first
      const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
      const passesCountryFilter =
    enabledCountries.has(plant.country);

      const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

      if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter) {
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
  }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, showUaePlants, showIndiaPlants, showKyrgyzstanPlants, minPowerOutput, maxPowerOutput]);

  // Get the actual list of nearby plants for the dialog (using debounced distance)
  const nearbyPlants = useMemo(() => {
    if (!showOnlyNearbyPlants || !lineIndex) return [];

    return powerPlants.filter(plant => {
      // Check if plant passes other filters first
      const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
      const passesCountryFilter =
    enabledCountries.has(plant.country);

      const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

      if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter) {
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
  }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, showUaePlants, showIndiaPlants, showKyrgyzstanPlants, minPowerOutput, maxPowerOutput]);

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

  const layers = useMemo(() => {
    const layerList = [
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
          case 'net_summer_capacity':
            value = d.netSummerCapacity || d.output;
            break;
          case 'net_winter_capacity':
            value = d.netWinterCapacity || d.output;
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
    showHifldLines && hifldLines.length > 0 && new PathLayer({
      id: 'hifld-lines',
      data: hifldLines,
      pickable: true,
      widthMinPixels: 0.5, // Thinner lines for cleaner look
      widthMaxPixels: 2, // Max width for visual clarity
      widthScale: 1,
      widthUnits: 'pixels',
      getPath: (d: TransmissionLine) => {
        // Verify coordinates are in correct format [lon, lat]
        if (!d.coordinates || d.coordinates.length === 0) {
          console.warn('⚠️ Transmission line has no coordinates:', d.id);
          return [];
        }
        // Ensure coordinates are in [lon, lat] format (GeoJSON standard)
        // PathLayer expects coordinates as [lon, lat][] which is what we have
        return d.coordinates;
      },
      getColor: (d: TransmissionLine) => {
        // Vary color by voltage class for better visual distinction
        const voltage = d.properties?.voltage || d.properties?.VOLTAGE;
        const voltClass = d.properties?.voltClass || d.properties?.VOLT_CLASS;
        
        // Higher voltage = brighter/more prominent color
        if (voltClass === '765' || voltClass === '500' || (voltage && voltage >= 500)) {
          return [0, 150, 255, 200]; // Bright blue for high voltage
        } else if (voltClass === '345' || voltClass === '230' || (voltage && voltage >= 230)) {
          return [50, 120, 200, 160]; // Medium blue for medium voltage
        } else {
          return [100, 150, 200, 120]; // Lighter blue for lower voltage
        }
      },
      getWidth: (d: TransmissionLine) => {
        // Vary width by voltage - higher voltage = thicker line
        const voltage = d.properties?.voltage || d.properties?.VOLTAGE;
        const voltClass = d.properties?.voltClass || d.properties?.VOLT_CLASS;
        
        if (voltClass === '765' || voltClass === '500' || (voltage && voltage >= 500)) {
          return 1.5; // Thicker for high voltage
        } else if (voltClass === '345' || voltClass === '230' || (voltage && voltage >= 230)) {
          return 1.0; // Medium width
        } else {
          return 0.8; // Thinner for lower voltage
        }
      },
      getPickingRadius: 8, // Picking radius for easier clicking
      opacity: 0.6, // Overall opacity for less visual clutter
      capRounded: true, // Rounded line caps for smoother appearance
      jointRounded: true, // Rounded joints for smoother appearance
      billboard: false, // Lines follow terrain
      onHover: (info: { object?: TransmissionLine }) => {
        // Only update hover if not persistent (clicked)
        if (!isLineTooltipPersistent) {
          setHoveredLine(info.object || null);
        }
      },
      updateTriggers: {
        data: hifldLines.length, // Force update when data changes
      },
    })
    ];
    
    const filteredLayers = layerList.filter(Boolean);
    return filteredLayers;
  }, [filteredPowerPlants, showPowerPlants, showWfsCables, wfsCables, showHifldLines, hifldLines, sizeMultiplier, capacityWeight, sizeByOption, setHoverInfo, powerRange, isLineTooltipPersistent]);

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
      
      {/* HIFLD Loading Indicator */}
      {loadingHifld && (
        <div className="data-warning" style={{ backgroundColor: 'rgba(0, 100, 200, 0.1)', borderColor: 'rgba(0, 100, 200, 0.3)' }}>
          <span>⏳ Loading HIFLD transmission lines... This may take 10-30 seconds.</span>
        </div>
      )}
      
      {/* HIFLD Data Status Message */}
      {!loadingHifld && hifldLines.length > 0 && showHifldLines && (
        <div className="data-warning" style={{ backgroundColor: 'rgba(0, 150, 0, 0.1)', borderColor: 'rgba(0, 150, 0, 0.3)' }}>
          <span>✅ {hifldLines.length} transmission lines loaded and displayed.</span>
        </div>
      )}

      <div className="map-container">
        <DeckGL
          initialViewState={{
            longitude: -95,
            latitude: 40,
            zoom: 3,
            pitch: 0,
            bearing: 0
          }}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
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
              setHoveredLine(info.object);
              setIsLineTooltipPersistent(true);
              setPersistentLine(info.object);
              return true;
            }
            // Click on empty space - clear hover but keep persistent
            if (!info.object) {
              setHoverInfo(null);
              setHoveredLine(null);
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
      </div>
      <Footer />

      {/* Unified Side Panel */}
      <SidePanel
        showPowerPlants={showPowerPlants}
        showWfsCables={showWfsCables}
        showHifldLines={showHifldLines}
        onTogglePowerPlants={() => setShowPowerPlants(!showPowerPlants)}
        onToggleWfsCables={() => setShowWfsCables(!showWfsCables)}
        onToggleHifldLines={() => setShowHifldLines(!showHifldLines)}
        filteredSources={filteredSources}
        onToggleSourceFilter={toggleSourceFilter}
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
        showSummerCapacity={showSummerCapacity}
        setShowSummerCapacity={setShowSummerCapacity}
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