/**
 * IndexedDB cache utility for large datasets
 * Provides better persistence and larger storage capacity than localStorage
 */

const DB_NAME = 'helios-map-cache';
const DB_VERSION = 1;
const STORE_NAME = 'hifld-data';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

class IndexedDBCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize IndexedDB database
   */
  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get cached data from IndexedDB
   */
  async get<T>(key: string, maxAgeMs?: number): Promise<T | null> {
    try {
      const db = await this.init();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result as CacheEntry<T> | undefined;
          if (!result) {
            resolve(null);
            return;
          }

          // Check if cache is expired
          if (maxAgeMs !== undefined) {
            const age = Date.now() - result.timestamp;
            if (age > maxAgeMs) {
              console.log(`Cache expired for ${key}: ${age}ms old (max: ${maxAgeMs}ms)`);
              resolve(null);
              return;
            }
          }

          resolve(result.data);
        };

        request.onerror = () => {
          console.error('Error reading from IndexedDB:', request.error);
          resolve(null); // Return null on error, don't reject
        };
      });
    } catch (error) {
      console.error('IndexedDB get error:', error);
      return null;
    }
  }

  /**
   * Store data in IndexedDB
   */
  async set<T>(key: string, data: T, version: string = 'v1'): Promise<boolean> {
    try {
      const db = await this.init();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          version,
        };

        const request = store.put({ key, ...entry });

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.error('Error writing to IndexedDB:', request.error);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('IndexedDB set error:', error);
      return false;
    }
  }

  /**
   * Clear cached data
   */
  async clear(key?: string): Promise<void> {
    try {
      const db = await this.init();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        if (key) {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => {
            console.error('Error clearing cache:', request.error);
            resolve();
          };
        } else {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => {
            console.error('Error clearing all cache:', request.error);
            resolve();
          };
        }
      });
    } catch (error) {
      console.error('IndexedDB clear error:', error);
    }
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ exists: boolean; count?: number }> {
    try {
      const db = await this.init();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => {
          resolve({ exists: true, count: request.result });
        };

        request.onerror = () => {
          resolve({ exists: false });
        };
      });
    } catch {
      return { exists: false };
    }
  }
}

// Export singleton instance
export const indexedDbCache = new IndexedDBCache();
