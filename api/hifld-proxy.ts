import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  try {
    // Extract query parameters from the request
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(v => query.append(key, v as string));
      } else if (value) {
        query.append(key, value as string);
      }
    }
    
    // Construct the HIFLD ArcGIS REST API URL
    const hifldUrl = `https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query?${query.toString()}`;
    
    // Forward the request to HIFLD service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout per request
    
    const response = await fetch(hifldUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mapping-Infra-App/1.0',
        'Accept': 'application/json,*/*',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // Get the response data
    const data = await response.text();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Set the appropriate content type based on the HIFLD response
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'application/json');
    }
    
    // Send the response
    return res.status(response.status).send(data);
  } catch (error) {
    console.error('HIFLD Proxy Error:', error);
    return res.status(500).json({ error: 'Failed to fetch data from HIFLD service' });
  }
}

