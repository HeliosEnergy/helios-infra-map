import { authenticatedFetch } from './auth';

export type PlantResearchRequest = {
  prompt: string;
  plant_name: string;
  state: string;
  owner: string;
  operator?: string;
  website_hint?: string;
};

export type PlantResearchResponse = {
  answer: string;
  citations: string[];
};

export async function askPlantResearch(request: PlantResearchRequest): Promise<PlantResearchResponse> {
  const response = await authenticatedFetch('/api/plant-research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Failed to run research: ${response.status}`);
  }

  return (await response.json()) as PlantResearchResponse;
}

