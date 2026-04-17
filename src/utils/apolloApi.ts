import { authenticatedFetch } from './auth';

export type Contact = {
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  phone?: string;
  company: string;
};

export type ApolloContactsResponse = {
  results: Record<string, Contact[]>;
};

export async function fetchApolloContacts(
  companies: string[]
): Promise<Record<string, Contact[]>> {
  if (companies.length === 0) {
    return {};
  }

  // Deduplicate and filter out empty company names
  const uniqueCompanies = [...new Set(companies.filter((c) => c.trim().length > 0))];

  if (uniqueCompanies.length === 0) {
    return {};
  }

  const response = await authenticatedFetch('/api/apollo-contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ companies: uniqueCompanies }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Failed to fetch contacts: ${response.status}`);
  }

  const data = (await response.json()) as ApolloContactsResponse;
  return data.results || {};
}
