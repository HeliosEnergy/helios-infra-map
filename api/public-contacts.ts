import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { requireAuth } from './_lib/auth.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'public-contacts',
  maxRequests: 30,
  windowMs: 60 * 1000,
};

type PublicContactEntry = {
  company: string;
  url?: string;
  plant_name?: string;
  state?: string;
  operator?: string;
};

type ContactResult = {
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  phone?: string;
  company: string;
};

type PerplexityContact = {
  name?: unknown;
  title?: unknown;
  email?: unknown;
  phone?: unknown;
  linkedin_url?: unknown;
  source_url?: unknown;
};

type AiDataCenterExperience = 'yes' | 'no' | 'info_not_available';

type PerplexityResponseShape = {
  owner_website?: unknown;
  contact_page_url?: unknown;
  contacts?: unknown;
  ai_data_center_experience?: unknown;
  ai_data_center_details?: unknown;
  ai_data_center_source_url?: unknown;
};

const parseBody = (req: VercelRequest): Record<string, unknown> => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body as Record<string, unknown>;
  return {};
};

const toAbsoluteUrl = (href: string, baseUrl: string): string | null => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
};

const uniq = <T>(items: T[]): T[] => Array.from(new Set(items));

const isBlockedHostname = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  return (
    h === 'gridinfo.com' ||
    h.endsWith('.gridinfo.com') ||
    h === 'linkedin.com' ||
    h.endsWith('.linkedin.com') ||
    h === 'facebook.com' ||
    h.endsWith('.facebook.com') ||
    h === 'instagram.com' ||
    h.endsWith('.instagram.com') ||
    h === 'x.com' ||
    h.endsWith('.x.com') ||
    h === 'twitter.com' ||
    h.endsWith('.twitter.com')
  );
};

const isBlockedUrl = (url: string): boolean => {
  try {
    return isBlockedHostname(new URL(url).hostname);
  } catch {
    return true;
  }
};

const normalizeString = (value: unknown): string => String(value || '').trim();

const normalizeUrl = (value: unknown, { allowLinkedin = false }: { allowLinkedin?: boolean } = {}): string => {
  const raw = normalizeString(value);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (!allowLinkedin && isBlockedHostname(hostname)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
};

const stripMarkdownCodeFence = (content: string): string => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const extractJsonObject = (content: string): string => {
  const stripped = stripMarkdownCodeFence(content);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return stripped.slice(start, end + 1);
  }
  return stripped;
};

const buildPerplexityPrompt = (entry: Required<Pick<PublicContactEntry, 'company'>> & PublicContactEntry): string => {
  const lines = [
    'Research the public business contact information for this power plant owner/operator.',
    '',
    `Plant name: ${normalizeString(entry.plant_name) || 'Unknown'}`,
    `State: ${normalizeString(entry.state) || 'Unknown'}`,
    `Owner company: ${entry.company}`,
    `Operator company: ${normalizeString(entry.operator) || 'Unknown'}`,
    `Existing website hint: ${normalizeString(entry.url) || 'Unknown'}`,
    '',
    'Rules:',
    '- Prefer official company websites and official contact pages.',
    '- Exclude gridinfo.com and other third-party directories/aggregators.',
    '- If plant-specific contacts are not public, return the best owner/operator business contact.',
    '- Return at most 2 contacts.',
    '- Also determine whether the owner/operator has worked on building AI data centers before.',
    '- Do not guess missing fields.',
    '- If a field cannot be verified from a source, leave it empty.',
    '- Each contact must include source_url pointing to the page where that contact detail was found.',
    '- For AI data center experience, include ai_data_center_source_url pointing to the page supporting the claim.',
    '- Return only valid JSON. No markdown, no commentary.',
    '',
    'Return exactly this JSON shape:',
    '{',
    '  "owner_website": "",',
    '  "contact_page_url": "",',
    '  "ai_data_center_experience": "yes|no|info_not_available",',
    '  "ai_data_center_details": "",',
    '  "ai_data_center_source_url": "",',
    '  "contacts": [',
    '    {',
    '      "name": "",',
    '      "title": "",',
    '      "email": "",',
    '      "phone": "",',
    '      "linkedin_url": "",',
    '      "source_url": ""',
    '    }',
    '  ]',
    '}',
  ];

  return lines.join('\n');
};

const parsePerplexityJson = (content: string): PerplexityResponseShape | null => {
  try {
    return JSON.parse(extractJsonObject(content)) as PerplexityResponseShape;
  } catch {
    return null;
  }
};

const sanitizePerplexityContacts = (
  company: string,
  parsed: PerplexityResponseShape | null
): ContactResult[] => {
  if (!parsed || !Array.isArray(parsed.contacts)) return [];

  const contacts = parsed.contacts as PerplexityContact[];
  const results: ContactResult[] = [];

  for (const contact of contacts) {
    const sourceUrl = normalizeUrl(contact?.source_url);
    const email = normalizeString(contact?.email);
    const phone = normalizeString(contact?.phone);
    const linkedinUrl = normalizeUrl(contact?.linkedin_url, { allowLinkedin: true });

    if (!sourceUrl) continue;
    if (!email && !phone && !linkedinUrl) continue;

    results.push({
      name: normalizeString(contact?.name),
      title: normalizeString(contact?.title),
      email,
      phone,
      linkedin_url: linkedinUrl,
      company,
    });
  }

  const seen = new Set<string>();
  return results.filter((contact) => {
    const key = `${contact.email}::${contact.phone || ''}::${contact.linkedin_url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
};

type CompanyResearchSummary = {
  ai_data_center_experience: AiDataCenterExperience;
  ai_data_center_details: string;
  ai_data_center_source_url: string;
};

const normalizeAiDataCenterExperience = (value: unknown): AiDataCenterExperience => {
  const v = normalizeString(value).toLowerCase();
  if (v === 'yes' || v === 'no' || v === 'info_not_available') return v;
  return 'info_not_available';
};

const sanitizeCompanyResearchSummary = (
  parsed: PerplexityResponseShape | null
): CompanyResearchSummary => {
  const experience = normalizeAiDataCenterExperience(parsed?.ai_data_center_experience);
  const details = normalizeString(parsed?.ai_data_center_details);
  const sourceUrl = normalizeUrl(parsed?.ai_data_center_source_url);

  // Only keep details when experience is "yes"; otherwise it can be misleading.
  return {
    ai_data_center_experience: experience,
    ai_data_center_details: experience === 'yes' ? details : '',
    ai_data_center_source_url: experience === 'yes' ? sourceUrl : '',
  };
};

const fetchPerplexityContacts = async (
  entry: Required<Pick<PublicContactEntry, 'company'>> & PublicContactEntry
): Promise<{ contacts: ContactResult[]; companyResearch: CompanyResearchSummary }> => {
  const apiKey = process.env.PERPLEXITY_API_KEY || '';
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY is not configured.');
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a careful web research assistant. Return only verified public business contact information as JSON. Never include gridinfo.com or other directory/aggregator results.',
        },
        {
          role: 'user',
          content: buildPerplexityPrompt(entry),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Perplexity request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = normalizeString(payload.choices?.[0]?.message?.content);
  const parsed = parsePerplexityJson(content);
  return {
    contacts: sanitizePerplexityContacts(entry.company, parsed),
    companyResearch: sanitizeCompanyResearchSummary(parsed),
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const body = parseBody(req);
  const entriesRaw = (body.entries || []) as unknown;
  const entries: PublicContactEntry[] = Array.isArray(entriesRaw) ? (entriesRaw as PublicContactEntry[]) : [];

  if (entries.length === 0) {
    return res.status(400).json({ error: 'entries array is required' });
  }

  if (entries.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 entries per request' });
  }

  const normalized = entries
    .map((e) => ({
      company: String(e.company || '').trim(),
      url: String(e.url || '').trim(),
      plant_name: String(e.plant_name || '').trim(),
      state: String(e.state || '').trim(),
      operator: String(e.operator || '').trim(),
    }))
    .filter((e) => e.company.length > 0);

  if (normalized.length === 0) {
    return res.status(400).json({ error: 'No valid entries provided' });
  }

  try {
    const results: Record<string, ContactResult[]> = {};
    const company_research: Record<string, CompanyResearchSummary> = {};

    // Limit concurrency so we do not overwhelm the research API.
    const batchSize = 3;
    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          try {
            const { contacts, companyResearch } = await fetchPerplexityContacts(entry);
            return { entry, contacts, companyResearch };
          } catch (error) {
            console.error('Public contact research failed:', entry.company, error);
            return {
              entry,
              contacts: [] as ContactResult[],
              companyResearch: {
                ai_data_center_experience: 'info_not_available' as AiDataCenterExperience,
                ai_data_center_details: '',
                ai_data_center_source_url: '',
              },
            };
          }
        })
      );

      for (const { entry, contacts, companyResearch } of batchResults) {
        results[entry.company] = (results[entry.company] || []).concat(contacts);
        company_research[entry.company] = companyResearch;
      }
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ results, company_research });
  } catch (error) {
    console.error('Error fetching public contacts:', error);
    return res.status(500).json({ error: 'Failed to fetch public contacts' });
  }
}

