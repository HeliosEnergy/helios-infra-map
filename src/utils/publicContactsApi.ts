import { authenticatedFetch } from './auth';
import type { Contact } from './apolloApi';

export type PublicContactEntry = {
  company: string;
  url?: string;
  plant_name?: string;
  state?: string;
  operator?: string;
};

export type PublicContactsResponse = {
  results: Record<string, Contact[]>;
  company_research?: Record<
    string,
    {
      ai_data_center_experience?: 'yes' | 'no' | 'info_not_available';
      ai_data_center_details?: string;
      ai_data_center_source_url?: string;
    }
  >;
};

export type CompanyResearchSummary = {
  ai_data_center_experience: 'yes' | 'no' | 'info_not_available';
  ai_data_center_details: string;
  ai_data_center_source_url: string;
};

export async function fetchPublicContacts(
  entries: PublicContactEntry[]
): Promise<{ results: Record<string, Contact[]>; company_research: Record<string, CompanyResearchSummary> }> {
  const normalized = entries
    .map((e) => ({
      company: String(e.company || '').trim(),
      url: String(e.url || '').trim(),
      plant_name: String(e.plant_name || '').trim(),
      state: String(e.state || '').trim(),
      operator: String(e.operator || '').trim(),
    }))
    .filter((e) => e.company.length > 0);

  if (normalized.length === 0) return { results: {}, company_research: {} };

  const response = await authenticatedFetch('/api/public-contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entries: normalized }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Failed to fetch public contacts: ${response.status}`);
  }

  const data = (await response.json()) as PublicContactsResponse;
  return {
    results: data.results || {},
    company_research: (data.company_research || {}) as Record<string, CompanyResearchSummary>,
  };
}

