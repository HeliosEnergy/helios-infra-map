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
};

export async function fetchPublicContacts(
  entries: PublicContactEntry[]
): Promise<Record<string, Contact[]>> {
  const normalized = entries
    .map((e) => ({
      company: String(e.company || '').trim(),
      url: String(e.url || '').trim(),
      plant_name: String(e.plant_name || '').trim(),
      state: String(e.state || '').trim(),
      operator: String(e.operator || '').trim(),
    }))
    .filter((e) => e.company.length > 0);

  if (normalized.length === 0) return {};

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
  return data.results || {};
}

