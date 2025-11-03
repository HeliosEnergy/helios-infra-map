export interface PowerPlant {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number]; // [longitude, latitude]
  country: 'CA' | 'US' | 'KZ' | 'AE' | 'IN' | 'KG' | 'USA' | 'CHN' | 'GBR' | 'BRA' | 'FRA' | 'DEU' | 'ESP' | 'RUS' | 'JPN' | 'AUS' | 'PRT' | 'CZE' | 'ITA' | 'CHL' | 'NOR' | 'MEX' | 'VNM' | 'ARG' | 'THA' | 'POL' | 'FIN' | 'IDN' | 'SWE' | 'CHE' | 'TUR' | 'KOR' | 'PHL' | 'IRN' | 'ZAF' | 'AUT' | 'SAU' | 'GRC' | 'GTM' | 'URY' | 'NLD' | 'BEL' | 'ROU' | 'UKR' | 'PAK' | 'EGY' | 'ISR' | 'IRL' | 'DZA' | 'BGD' | 'MYS' | 'LKA' | 'DNK' | 'MAR' | 'VEN' | 'NZL' | 'BGR' | 'HND' | 'TWN' | 'MMR' | 'JOR' | 'PER' | 'PRK' | 'SVK' | 'IRQ' | 'TUN' | 'CRI' | 'BOL' | 'COL' | 'HRV' | 'BLR' | 'MUS' | 'KEN' | 'ECU' | 'LAO' | 'ISL' | 'BIH' | 'SDN' | 'GEO' | 'SYR' | 'HUN' | 'PAN' | 'EST' | 'UZB' | 'SLV' | 'NIC' | 'KHM' | 'ZMB' | 'PNG' | 'DOM' | 'COD' | 'SGP' | 'NPL' | 'CUB' | 'AZE' | 'AGO' | 'NGA' | 'NAM' | 'ETH' | 'SRB' | 'QAT' | 'OMN' | 'MKD' | 'MDG' | 'LBY' | 'FJI' | 'UGA' | 'TZA' | 'RWA' | 'TJK' | 'SEN' | 'JAM' | 'KWT' | 'GIN' | 'AFG' | 'SVN' | 'MNG' | 'COG' | 'CMR' | 'CIV' | 'BHR' | 'ARM' | 'ALB' | 'YEM' | 'TKM' | 'NER' | 'MRT' | 'LBN' | 'BFA' | 'TTO' | 'SWZ' | 'MDA' | 'LTU' | 'GUF' | 'GHA' | 'GAB' | 'MWI' | 'LVA' | 'GUY' | 'BTN' | 'MLI' | 'CPV' | 'BRN' | 'BDI' | 'TGO' | 'SLE' | 'PRY' | 'MOZ' | 'MNE' | 'GNQ' | 'CYP' | 'ZWE' | 'LUX' | 'LBR' | 'KOS' | 'GMB' | 'ERI' | 'CAF' | 'BWA' | 'BEN' | 'ATA' | 'SUR' | 'PSE' | 'LSO' | 'LCA' | 'GNB' | 'ESH' | 'DJI';
  capacityFactor?: number | null;
  generation?: number;
  netSummerCapacity?: number;
  netWinterCapacity?: number;
  historicalAvgGeneration?: number;
  // Global database specific fields
  capacityMW?: number; // Installed capacity from global database
  usedCapacity?: number; // Calculated used capacity from generation data
  generationGWh?: number; // Generation data from global database
  // Additional fields for hover panel
  rawData?: Record<string, string>; // Store all original CSV fields
}