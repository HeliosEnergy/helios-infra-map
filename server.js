import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());

// CORS for local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Apollo contacts endpoint
app.post('/api/apollo-contacts', async (req, res) => {
  const apolloApiKey = process.env.APOLLO_API_KEY;
  if (!apolloApiKey) {
    return res.status(500).json({ error: 'APOLLO_API_KEY not set in .env' });
  }

  const { companies } = req.body;
  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'companies array is required' });
  }

  if (companies.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 companies per request' });
  }

  try {
    const results = {};

    for (const company of companies) {
      try {
        const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey,
          },
          body: JSON.stringify({
            q_organization_name: company,
            per_page: 5,
            page: 1,
            person_titles: [
              'CEO', 'Chief Executive Officer', 'President', 'Owner',
              'Managing Director', 'Director', 'VP', 'Vice President',
              'General Manager', 'Plant Manager', 'Operations Manager',
              'Business Development',
            ],
          }),
        });

        if (!response.ok) {
          console.error(`Apollo API error for ${company}:`, response.status);
          results[company] = [];
          continue;
        }

        const data = await response.json();
        results[company] = (data.people || []).map((person) => ({
          name: person.name || `${person.first_name} ${person.last_name}`.trim(),
          title: person.title || '',
          email: person.email || '',
          linkedin_url: person.linkedin_url || '',
          company: person.organization_name || company,
        }));
      } catch (err) {
        console.error(`Error fetching contacts for ${company}:`, err);
        results[company] = [];
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error fetching Apollo contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`Apollo API key: ${process.env.APOLLO_API_KEY ? 'configured' : 'NOT SET'}`);
});
