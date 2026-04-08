import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { requireAuth } from './_lib/auth.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'apollo-contacts',
  maxRequests: 60,
  windowMs: 60 * 1000,
};

type ApolloContact = {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  organization_name: string;
};

type ApolloSearchResponse = {
  people: ApolloContact[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
};

type ContactResult = {
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  company: string;
};

async function searchApolloContacts(
  companyName: string,
  apiKey: string
): Promise<ContactResult[]> {
  const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: companyName,
      per_page: 5,
      page: 1,
      person_titles: [
        'CEO',
        'Chief Executive Officer',
        'President',
        'Owner',
        'Managing Director',
        'Director',
        'VP',
        'Vice President',
        'General Manager',
        'Plant Manager',
        'Operations Manager',
        'Business Development',
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Apollo API error:', response.status, errorText);
    throw new Error(`Apollo API error: ${response.status}`);
  }

  const data = (await response.json()) as ApolloSearchResponse;

  return (data.people || []).map((person) => ({
    name: person.name || `${person.first_name} ${person.last_name}`.trim(),
    title: person.title || '',
    email: person.email || '',
    linkedin_url: person.linkedin_url || '',
    company: person.organization_name || companyName,
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res)) return;

  const apolloApiKey = process.env.APOLLO_API_KEY;
  if (!apolloApiKey) {
    return res.status(500).json({ error: 'Apollo API key not configured' });
  }

  const { companies } = req.body as { companies?: string[] };

  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'companies array is required' });
  }

  if (companies.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 companies per request' });
  }

  try {
    const results: Record<string, ContactResult[]> = {};

    // Process companies in parallel with a concurrency limit
    const batchSize = 5;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (company) => {
          try {
            const contacts = await searchApolloContacts(company, apolloApiKey);
            return { company, contacts };
          } catch (error) {
            console.error(`Error fetching contacts for ${company}:`, error);
            return { company, contacts: [] };
          }
        })
      );

      for (const { company, contacts } of batchResults) {
        results[company] = contacts;
      }
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Error fetching Apollo contacts:', error);
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
}
