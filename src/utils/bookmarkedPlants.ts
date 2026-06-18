import type { PowerPlant } from '../models/PowerPlant';
import { authenticatedFetch } from './auth';

export type BookmarkedPlantRef = Pick<
  PowerPlant,
  'id' | 'name' | 'coordinates' | 'source' | 'outputDisplay' | 'country'
>;

export const BOOKMARKS_STORAGE_KEY = 'bookmarked-power-plants-v1';

export const loadBookmarkedPlants = (): Map<string, BookmarkedPlantRef> => {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw) as BookmarkedPlantRef[];
    if (!Array.isArray(parsed)) return new Map();

    return new Map(
      parsed
        .filter((plant) => plant?.id && Array.isArray(plant.coordinates))
        .map((plant) => [plant.id, plant])
    );
  } catch {
    return new Map();
  }
};

export const saveBookmarkedPlants = (plants: Map<string, BookmarkedPlantRef>) => {
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(Array.from(plants.values())));
};

export const toBookmarkRef = (plant: PowerPlant | BookmarkedPlantRef): BookmarkedPlantRef => ({
  id: plant.id,
  name: plant.name,
  coordinates: plant.coordinates,
  source: plant.source,
  outputDisplay: plant.outputDisplay,
  country: plant.country,
});

const toBookmarksMap = (plants: BookmarkedPlantRef[]): Map<string, BookmarkedPlantRef> =>
  new Map(
    plants
      .filter((plant) => plant?.id && Array.isArray(plant.coordinates))
      .map((plant) => [plant.id, plant])
  );

export const fetchBookmarkedPlants = async (): Promise<Map<string, BookmarkedPlantRef>> => {
  const response = await authenticatedFetch('/api/bookmarks');
  if (!response.ok) {
    throw new Error(`Failed to load saved power plants: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: BookmarkedPlantRef[] };
  return toBookmarksMap(Array.isArray(payload.data) ? payload.data : []);
};

export const saveBookmarkedPlant = async (plant: PowerPlant | BookmarkedPlantRef): Promise<BookmarkedPlantRef> => {
  const bookmark = toBookmarkRef(plant);
  const response = await authenticatedFetch('/api/bookmarks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bookmark),
  });

  if (!response.ok) {
    throw new Error(`Failed to save power plant bookmark: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: BookmarkedPlantRef };
  return payload.data ? toBookmarkRef(payload.data) : bookmark;
};

export const deleteBookmarkedPlant = async (plantId: string): Promise<void> => {
  const response = await authenticatedFetch(`/api/bookmarks?plantId=${encodeURIComponent(plantId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to remove power plant bookmark: ${response.status}`);
  }
};

export const clearBookmarkedPlants = async (): Promise<void> => {
  const response = await authenticatedFetch('/api/bookmarks', {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear power plant bookmarks: ${response.status}`);
  }
};
