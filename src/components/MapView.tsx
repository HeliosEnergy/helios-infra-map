import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Map, { NavigationControl } from 'react-map-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import { loadWfsCableData } from '../utils/wfsDataLoader';
import { loadAndProcessAllPowerPlants } from '../utils/unifiedPowerPlantProcessor';
import { isPointNearLine } from '../utils/geoUtils';
import type { LineSegment } from '../utils/spatialIndex';
import { createLineIndex, queryLineIndex } from '../utils/spatialIndex';
import { calculatePowerRange, type PowerRange } from '../utils/powerRangeCalculator';
import { globalProgressIndicator } from '../utils/progressIndicator';
import RBush from 'rbush';
import { useTheme } from '../hooks/useTheme';
import SidePanel from './SidePanel';
import ProximityDialog from './ProximityDialog';
import { Search, MapPin, X } from 'lucide-react';
import type { PowerPlant } from '../models/PowerPlant';
import type { Cable } from '../models/Cable';

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

interface MapViewProps {
  showKazakhstanPlants: boolean;
  onToggleKazakhstanPlants: () => void;
}

const MapView: React.FC<MapViewProps> = ({ showKazakhstanPlants, onToggleKazakhstanPlants }) => {
  const { theme } = useTheme();
  const [powerPlants, setPowerPlants] = useState<PowerPlant[]>([]);
  const [wfsCables, setWfsCables] = useState<Cable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading data...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [showPowerPlants, setShowPowerPlants] = useState<boolean>(true);
  const [showWfsCables, setShowWfsCables] = useState<boolean>(true);
  const [hoverInfo, setHoverInfo] = useState<PowerPlant | null>(null);
  // State for filtering power plants by source
  const [filteredSources, setFilteredSources] = useState<Set<string>>(new Set());
  // State for power output range filtering (0 MW to 10000 MW)
  const [minPowerOutput, setMinPowerOutput] = useState<number>(0);
  const [maxPowerOutput, setMaxPowerOutput] = useState<number>(10000);
  // State for capacity factor range filtering (0% to 100%)
  const [minCapacityFactor, setMinCapacityFactor] = useState<number>(0);
  const [maxCapacityFactor, setMaxCapacityFactor] = useState<number>(100);
  // State for country filtering
  const [showCanadianPlants, setShowCanadianPlants] = useState<boolean>(true);
  const [showAmericanPlants, setShowAmericanPlants] = useState<boolean>(true);
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

   // Subscribe to progress updates
   useEffect(() => {
     const unsubscribe = globalProgressIndicator.subscribe((progress, message) => {
       setLoadingProgress(progress);
       setLoadingMessage(message);
     });

     return () => {
       unsubscribe();
     };
   }, []);

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
       setLoadingMessage('Loading data...');
       setLoadingProgress(0);

       try {
         // Load all power plant data using the new unified processor
         const powerPlantData = await loadAndProcessAllPowerPlants();

         // Load WFS submarine cable data (unchanged)
         const wfsCableData = await loadWfsCableData();

         setPowerPlants(powerPlantData);
         setWfsCables(wfsCableData);

         // Calculate actual power range from data
         const calculatedRange = calculatePowerRange(powerPlantData);
         setPowerRange(calculatedRange);

         // Update current filter values to fit within new range if needed
         setMinPowerOutput(prev => Math.max(prev, calculatedRange.min));
         setMaxPowerOutput(prev => Math.min(prev, calculatedRange.max));

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

      // New country filtering
      const passesCountryFilter =
        (showCanadianPlants && plant.country === 'CA') ||
        (showAmericanPlants && plant.country === 'US') ||
        (showKazakhstanPlants && plant.country === 'KZ');

     // New power output range filtering
     const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;

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

     return passesSourceFilter && passesCountryFilter && passesPowerOutputFilter && passesNearbyFilter && passesStatusFilter && passesPlantSelectionFilter;
   });

   // Get all unique sources from the data for the legend
   const allSourcesInData = Array.from(new Set(powerPlants.map(plant => plant.source))).sort();

    // Calculate count of plants within proximity distance (using debounced value for performance)
    const proximityPlantCount = useMemo(() => {
      if (!showOnlyNearbyPlants || !lineIndex) return 0;

      return powerPlants.filter(plant => {
        // Check if plant passes other filters first
        const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
        const passesCountryFilter =
          (showCanadianPlants && plant.country === 'CA') ||
          (showAmericanPlants && plant.country === 'US') ||
          (showKazakhstanPlants && plant.country === 'KZ');
        const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;
        const passesCapacityFactorFilter = minCapacityFactor <= (plant.capacityFactor || 0) && (plant.capacityFactor || 0) <= maxCapacityFactor;
        const plantStatus = plant.rawData?.statusDescription || 'N/A';
        const passesStatusFilter = filteredStatuses.has(plantStatus);

        if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter || !passesCapacityFactorFilter || !passesStatusFilter) {
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
    }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, minPowerOutput, maxPowerOutput, minCapacityFactor, maxCapacityFactor, filteredStatuses]);

    // Get the actual list of nearby plants for the dialog (using debounced distance)
    const nearbyPlants = useMemo(() => {
      if (!showOnlyNearbyPlants || !lineIndex) return [];

      return powerPlants.filter(plant => {
        // Check if plant passes other filters first
        const passesSourceFilter = filteredSources.has(plant.source) || plant.source === 'other';
        const passesCountryFilter =
          (showCanadianPlants && plant.country === 'CA') ||
          (showAmericanPlants && plant.country === 'US') ||
          (showKazakhstanPlants && plant.country === 'KZ');
        const passesPowerOutputFilter = plant.output >= minPowerOutput && plant.output <= maxPowerOutput;
        const passesCapacityFactorFilter = minCapacityFactor <= (plant.capacityFactor || 0) && (plant.capacityFactor || 0) <= maxCapacityFactor;
        const plantStatus = plant.rawData?.statusDescription || 'N/A';
        const passesStatusFilter = filteredStatuses.has(plantStatus);

        if (!passesSourceFilter || !passesCountryFilter || !passesPowerOutputFilter || !passesCapacityFactorFilter || !passesStatusFilter) {
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
    }, [powerPlants, showOnlyNearbyPlants, lineIndex, debouncedDistance, filteredSources, showCanadianPlants, showAmericanPlants, showKazakhstanPlants, minPowerOutput, maxPowerOutput, minCapacityFactor, maxCapacityFactor, filteredStatuses]);

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
     return [
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
             value = d.generation || d.output;
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
       onHover: (info: { object?: PowerPlant }) => {
         // Always update hoverInfo with the hovered object or null
         // The rendering logic will handle showing the persistent plant when needed
         setHoverInfo(info.object || null);
       },
        onClick: (info: { object?: PowerPlant }) => {
          if (info.object) {
            setHoverInfo(info.object);
            setIsTooltipPersistent(true);
            setPersistentPlant(info.object);
          }
        },
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
     })
     ].filter(Boolean);
   }, [filteredPowerPlants, showPowerPlants, showWfsCables, wfsCables, sizeMultiplier, capacityWeight, sizeByOption, setHoverInfo, powerRange]);

    return (
      <div className="map-view-content">
       {loading && (
         <div className="loading-indicator">
           <div className="loading-content">
             <div className="loading-spinner"></div>
             <div className="loading-text">{loadingMessage}</div>
             <div className="loading-progress">
               <div
                 className="loading-progress-bar"
                 style={{ width: `${loadingProgress}%` }}
               ></div>
             </div>
             <div className="loading-progress-text">{Math.round(loadingProgress)}%</div>
           </div>
         </div>
       )}

       <div className="map-container">
          <DeckGL
            initialViewState={{
              longitude: -95,
              latitude: 55,
              zoom: 3,
              pitch: 0,
              bearing: 0
            }}
            controller={true}
            layers={layers}
            getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
          >
            <Map
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={theme === 'dark' ? "mapbox://styles/mapbox/dark-v10" : "mapbox://styles/mapbox/light-v10"}
            >
             <NavigationControl position="top-right" />
           </Map>
         </DeckGL>
        </div>

        {/* Unified Side Panel */}
         <SidePanel
          showPowerPlants={showPowerPlants}
          showWfsCables={showWfsCables}
          onTogglePowerPlants={() => setShowPowerPlants(!showPowerPlants)}
          onToggleWfsCables={() => setShowWfsCables(!showWfsCables)}
          filteredSources={filteredSources}
          onToggleSourceFilter={toggleSourceFilter}
          showCanadianPlants={showCanadianPlants}
          showAmericanPlants={showAmericanPlants}
          showKazakhstanPlants={showKazakhstanPlants}
          onToggleCanadianPlants={() => setShowCanadianPlants(!showCanadianPlants)}
          onToggleAmericanPlants={() => setShowAmericanPlants(!showAmericanPlants)}
          onToggleKazakhstanPlants={onToggleKazakhstanPlants}
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
         allStatuses={allStatuses}
         filteredStatuses={filteredStatuses}
         onToggleStatusFilter={toggleStatusFilter}
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

         {/* Unified Info Panel */}
        {(hoverInfo || isTooltipPersistent) && (
          <div className="info-panel">
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
             {((): React.ReactNode => {
               // Show persistent plant when in persistent mode, otherwise show hovered plant
               const plant = isTooltipPersistent ? persistentPlant : hoverInfo;
              if (!plant) return null;
              
              return (
                <>
                  <h3>{plant.name}</h3>
                  <p>Output: {plant.outputDisplay}</p>
                  <p>Source: {plant.source}</p>
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
     </div>
   );
};

export default MapView;