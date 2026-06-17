import type { PowerPlant } from '../models/PowerPlant';

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

export const toBookmarkRef = (plant: PowerPlant): BookmarkedPlantRef => ({
  id: plant.id,
  name: plant.name,
  coordinates: plant.coordinates,
  source: plant.source,
  outputDisplay: plant.outputDisplay,
  country: plant.country,
});
