
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, Area, AreaChart } from 'recharts';
import './DataVisualizations.css';
import { authenticatedFetch } from '../utils/auth';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1919', '#82ca9d', '#ffc658'];

interface EIAPlantData {
  'net-summer-capacity-mw': string;
  'net-winter-capacity-mw': string;
  'energy-source-desc': string;
  technology: string;
  statusDescription: string;
  stateName: string;
  output?: number;
  source?: string;
  name?: string;
  plantName?: string;
  rawData?: Record<string, string>;
  [key: string]: string | number | Record<string, string> | undefined;
}

const getPlantCapacity = (plant: EIAPlantData): number => {
  const raw = plant['net-summer-capacity-mw'] || plant['nameplate-capacity-mw'];
  if (typeof raw === 'string') return parseFloat(raw || '0');
  if (typeof plant.output === 'number') return plant.output;
  return 0;
};

const getPlantWinterCapacity = (plant: EIAPlantData): number => {
  const raw = plant['net-winter-capacity-mw'];
  if (typeof raw === 'string') return parseFloat(raw || '0');
  return getPlantCapacity(plant);
};

const getPlantStatus = (plant: EIAPlantData): string =>
  plant.statusDescription || plant.rawData?.statusDescription || 'Unknown';

const getPlantTechnology = (plant: EIAPlantData): string =>
  plant.technology || plant.rawData?.technology || 'Unknown';

const getPlantSource = (plant: EIAPlantData): string =>
  plant['energy-source-desc'] || plant.source || 'Unknown';

const getPlantName = (plant: EIAPlantData): string => plant.plantName || plant.name || 'Unknown';

const getPlantState = (plant: EIAPlantData): string =>
  plant.stateName || plant.rawData?.['State / Province / Territory'] || 'Unknown';

const DataVisualizations: React.FC = () => {
  const [eiaData, setEiaData] = useState<EIAPlantData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load EIA data
        const eiaResponse = await authenticatedFetch('/api/power-plants');
        const eiaJson = await eiaResponse.json();
        setEiaData(eiaJson);



      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Regional capacity analysis
  const regionalCapacityData = useMemo(() => {
    const regionMap: Record<string, number> = {};

    eiaData.forEach((plant: EIAPlantData) => {
      const region = getPlantState(plant);
      const capacity = getPlantCapacity(plant);
      regionMap[region] = (regionMap[region] || 0) + capacity;
    });

    return Object.entries(regionMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([region, capacity]) => ({
        region: region.length > 10 ? region.substring(0, 10) + '...' : region,
        capacity: Math.round(capacity),
        fullRegion: region
      }));
  }, [eiaData]);

  // Capacity factor analysis
  const capacityFactorData = useMemo(() => {
    const sourceMap: Record<string, { total: number, count: number }> = {};

    eiaData.forEach((plant: EIAPlantData) => {
      const source = getPlantSource(plant);
      const capacity = getPlantCapacity(plant);

      if (!sourceMap[source]) {
        sourceMap[source] = { total: 0, count: 0 };
      }
      sourceMap[source].total += capacity;
      sourceMap[source].count += 1;
    });

    return Object.entries(sourceMap)
      .map(([source, data]) => ({
        source: source.length > 12 ? source.substring(0, 12) + '...' : source,
        avgCapacity: Math.round(data.total / data.count),
        plantCount: data.count,
        fullSource: source
      }))
      .sort((a, b) => b.avgCapacity - a.avgCapacity)
      .slice(0, 6);
  }, [eiaData]);

  // Technology distribution
  const technologyData = useMemo(() => {
    const techMap: Record<string, number> = {};

    eiaData.forEach((plant: EIAPlantData) => {
      const tech = getPlantTechnology(plant);
      const capacity = getPlantCapacity(plant);
      techMap[tech] = (techMap[tech] || 0) + capacity;
    });

    return Object.entries(techMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tech, capacity]) => ({
        technology: tech.length > 15 ? tech.substring(0, 15) + '...' : tech,
        capacity: Math.round(capacity),
        fullTech: tech
      }));
  }, [eiaData]);

  // Status distribution
  const statusData = useMemo(() => {
    const statusMap: Record<string, number> = {};

    eiaData.forEach((plant: EIAPlantData) => {
      const status = getPlantStatus(plant);
      statusMap[status] = (statusMap[status] || 0) + 1;
    });

    return Object.entries(statusMap)
      .map(([status, count]) => ({
        status: status.length > 10 ? status.substring(0, 10) + '...' : status,
        count,
        fullStatus: status
      }))
      .sort((a, b) => b.count - a.count);
  }, [eiaData]);

  // Seasonal capacity analysis
  const seasonalCapacityData = useMemo(() => {
    const seasonData = [
      { season: 'Summer', capacity: 0, plants: 0 },
      { season: 'Winter', capacity: 0, plants: 0 }
    ];

    eiaData.forEach((plant: EIAPlantData) => {
      const summerCap = getPlantCapacity(plant);
      const winterCap = getPlantWinterCapacity(plant);

      seasonData[0].capacity += summerCap;
      seasonData[0].plants += 1;
      seasonData[1].capacity += winterCap;
      seasonData[1].plants += 1;
    });

    return seasonData.map(item => ({
      ...item,
      capacity: Math.round(item.capacity)
    }));
  }, [eiaData]);

  // Power reliability scoring (composite score for data center suitability)
  const reliabilityScoringData = useMemo(() => {
    const scoredPlants = eiaData.map((plant: EIAPlantData) => {
      const summerCap = getPlantCapacity(plant);
      const winterCap = getPlantWinterCapacity(plant);
      const status = getPlantStatus(plant);
      const technology = getPlantTechnology(plant);

      // Base score starts at 50
      let score = 50;

      // Status bonuses/penalties
      if (status === 'Operating') score += 20;
      else if (status === 'Planned') score += 10;
      else if (status === 'Retired') score -= 30;

      // Technology reliability factors
      const reliableTechs = ['Nuclear', 'Hydroelectric', 'Natural Gas Fired Combined Cycle'];
      const variableTechs = ['Solar', 'Wind'];
      if (reliableTechs.some(tech => technology.includes(tech))) score += 15;
      if (variableTechs.some(tech => technology.includes(tech))) score -= 10;

      // Capacity stability (lower seasonal variation = higher score)
      const seasonalVariation = Math.abs(summerCap - winterCap) / Math.max(summerCap, winterCap);
      score -= seasonalVariation * 20; // Penalize high variation

      // Size factor (larger plants often more stable)
      if (summerCap > 500) score += 10;
      else if (summerCap < 50) score -= 5;

      return {
        plantName: getPlantName(plant),
        state: getPlantState(plant),
        technology: technology.length > 12 ? technology.substring(0, 12) + '...' : technology,
        capacity: Math.round(summerCap),
        score: Math.max(0, Math.min(100, Math.round(score))),
        status: status.length > 8 ? status.substring(0, 8) + '...' : status,
        fullTech: technology,
        fullStatus: status
      };
    });

    return scoredPlants
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10 most reliable plants
  }, [eiaData]);

  // Excess capacity analysis
  const excessCapacityData = useMemo(() => {
    // Assume 80% utilization rate for excess capacity calculation
    const utilizationRate = 0.8;

    const plantsWithExcess = eiaData
      .filter((plant: EIAPlantData) => {
        const capacity = getPlantCapacity(plant);
        return capacity > 100; // Only consider larger plants
      })
      .map((plant: EIAPlantData) => {
        const capacity = getPlantCapacity(plant);
        const utilized = capacity * utilizationRate;
        const excess = capacity - utilized;

        return {
          plantName: getPlantName(plant),
          state: getPlantState(plant),
          totalCapacity: Math.round(capacity),
          excessCapacity: Math.round(excess),
          excessPercentage: Math.round((excess / capacity) * 100)
        };
      })
      .filter(plant => plant.excessCapacity > 50) // Only show plants with significant excess
      .sort((a, b) => b.excessCapacity - a.excessCapacity)
      .slice(0, 8);

    return plantsWithExcess;
  }, [eiaData]);

  // Technology efficiency analysis
  const technologyEfficiencyData = useMemo(() => {
    const techStats: Record<string, { totalCapacity: number, count: number, avgCapacity: number }> = {};

    eiaData.forEach((plant: EIAPlantData) => {
      const tech = getPlantTechnology(plant);
      const capacity = getPlantCapacity(plant);

      if (!techStats[tech]) {
        techStats[tech] = { totalCapacity: 0, count: 0, avgCapacity: 0 };
      }
      techStats[tech].totalCapacity += capacity;
      techStats[tech].count += 1;
    });

    return Object.entries(techStats)
      .map(([tech, stats]) => ({
        technology: tech.length > 15 ? tech.substring(0, 15) + '...' : tech,
        avgCapacity: Math.round(stats.totalCapacity / stats.count),
        totalCapacity: Math.round(stats.totalCapacity),
        plantCount: stats.count,
        efficiency: stats.count > 5 ? 'High' : stats.count > 2 ? 'Medium' : 'Low',
        fullTech: tech
      }))
      .sort((a, b) => b.avgCapacity - a.avgCapacity)
      .slice(0, 6);
  }, [eiaData]);

  if (loading) {
    return <div className="data-loading">Loading data analysis...</div>;
  }

  return (
    <div className="data-analysis-dashboard">
      {/* 
        REGIONAL CAPACITY GRAPH - COMMENTED OUT
        ==========================================
        This graph has been temporarily commented out because it's not showing results properly.
        The data structure needs to be figured out before this can be re-enabled.
        
        TO RE-ENABLE: Uncomment the section below (from the opening comment to the closing comment)
        and ensure the eiaData structure matches what the regionalCapacityData calculation expects.
      */}
      {/*
      <div className="analysis-section compact">
        <h4 className="section-title">Regional Capacity (Top 8 States)</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={regionalCapacityData}
              layout="horizontal"
              margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
            >
              <XAxis type="number" fontSize={9} />
              <YAxis
                type="category"
                dataKey="region"
                fontSize={9}
                width={50}
              />
              <Tooltip
                formatter={(value) => [value + ' MW', 'Capacity']}
                labelFormatter={(label) => {
                  const item = regionalCapacityData.find(d => d.region === label);
                  return item?.fullRegion || label;
                }}
              />
              <Bar dataKey="capacity" fill="#0088FE" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      */}

      {/* Capacity Factor Analysis */}
      <div className="analysis-section">
        <h4 className="section-title">Avg Capacity by Energy Source</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={capacityFactorData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="source"
                fontSize={9}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis fontSize={10} />
              <Tooltip
                formatter={(value) => [value + ' MW', 'Avg Capacity']}
                labelFormatter={(label) => {
                  const item = capacityFactorData.find(d => d.source === label);
                  return item?.fullSource || label;
                }}
              />
              <Bar dataKey="avgCapacity" fill="#00C49F" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Technology Distribution */}
      <div className="analysis-section">
        <h4 className="section-title">Technology Capacity (Top 5)</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={technologyData}
                cx="50%"
                cy="50%"
                outerRadius={50}
                dataKey="capacity"
                label={({ capacity }) => `${capacity}MW`}
                labelLine={false}
              >
                {technologyData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [value + ' MW', 'Capacity']}
                labelFormatter={(label) => {
                  const item = technologyData.find(d => d.technology === label);
                  return item?.fullTech || label;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Seasonal Capacity */}
      <div className="analysis-section">
        <h4 className="section-title">Seasonal Capacity Variation</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={seasonalCapacityData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis dataKey="season" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip formatter={(value) => [value + ' MW', 'Capacity']} />
              <Area type="monotone" dataKey="capacity" stroke="#FFBB28" fill="#FFBB28" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="analysis-section">
        <h4 className="section-title">Plant Status Distribution</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={statusData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="status"
                fontSize={9}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis fontSize={10} />
              <Tooltip
                formatter={(value) => [value, 'Plants']}
                labelFormatter={(label) => {
                  const item = statusData.find(d => d.status === label);
                  return item?.fullStatus || label;
                }}
              />
              <Bar dataKey="count" fill="#AF19FF" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Power Reliability Scoring */}
      <div className="analysis-section reliability-section">
        <h4 className="section-title">Top 10 Reliable Plants (Data Center Score)</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={reliabilityScoringData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="plantName"
                fontSize={8}
                angle={-45}
                textAnchor="end"
                height={70}
                interval={0}
              />
              <YAxis fontSize={10} domain={[0, 100]} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'score') return [value + '/100', 'Reliability Score'];
                  return [value + ' MW', 'Capacity'];
                }}
                labelFormatter={(label) => {
                  const item = reliabilityScoringData.find(d => d.plantName === label);
                  return item ? `${item.plantName} (${item.state})` : label;
                }}
              />
              <Bar dataKey="score" fill="#00C49F" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Excess Capacity Analysis */}
      <div className="analysis-section excess-section">
        <h4 className="section-title">Plants with Excess Capacity (&gt;50MW)</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={excessCapacityData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="plantName"
                fontSize={8}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis fontSize={10} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'excessCapacity') return [value + ' MW', 'Excess Capacity'];
                  return [value + '%', 'Excess %'];
                }}
                labelFormatter={(label) => {
                  const item = excessCapacityData.find(d => d.plantName === label);
                  return item ? `${item.plantName} (${item.state})` : label;
                }}
              />
              <Bar dataKey="excessCapacity" fill="#FFBB28" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Technology Efficiency Analysis */}
      <div className="analysis-section efficiency-section">
        <h4 className="section-title">Technology Efficiency (Avg Capacity)</h4>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={technologyEfficiencyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="technology"
                fontSize={8}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis fontSize={10} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'avgCapacity') return [value + ' MW', 'Avg Capacity'];
                  return [value, 'Plants'];
                }}
                labelFormatter={(label) => {
                  const item = technologyEfficiencyData.find(d => d.technology === label);
                  return item?.fullTech || label;
                }}
              />
              <Bar dataKey="avgCapacity" fill="#FF8042" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Export Section */}
      <div className="analysis-section export-section">
        <h4 className="section-title">Data Export</h4>
        <div className="export-options">
          <button
            className="export-btn"
            onClick={() => {
              const dataStr = JSON.stringify(eiaData.slice(0, 100), null, 2);
              const dataBlob = new Blob([dataStr], { type: 'application/json' });
              const url = URL.createObjectURL(dataBlob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'power_plant_data_sample.json';
              link.click();
            }}
          >
            Export Sample Data (JSON)
          </button>
          <button
            className="export-btn"
            onClick={() => {
              const csvData = [
                ['Region', 'Capacity (MW)'],
                ...regionalCapacityData.map(d => [d.fullRegion, d.capacity])
              ];
              const csvContent = csvData.map(row => row.join(',')).join('\n');
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'regional_capacity.csv';
              link.click();
            }}
          >
            Export Regional Data (CSV)
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataVisualizations;
