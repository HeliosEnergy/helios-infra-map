import LZString from 'lz-string';
import type { Cable } from '../models/Cable';
import type { TransmissionLine } from '../models/TransmissionLine';

export interface CacheMetadata {
  timestamp: number;
  version: string;
  size: number;        // Original data size (uncompressed)
  compressedSize: number; // Compressed data size
  compressed: boolean;
}

export interface CacheEntry {
  metadata: CacheMetadata;
  data: string; // Always stored as compressed string
}

/**
 * Cache utilities for localStorage with compression support
 */
export class CacheManager {
  private static readonly CACHE_PREFIX = 'mapping_infra_cache_';
  private static readonly DEFAULT_VERSION = 'v1';
  private static readonly MAX_CHUNK_SIZE = 1000000; // 1MB chunks

  /**
   * Check if data will fit in localStorage
   */
  private static willFitInStorage(data: string): boolean {
    const testKey = '__storage_test__';
    try {
      localStorage.setItem(testKey, data);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get total localStorage usage in bytes
   */
  static getStorageUsage(): number {
    let total = 0;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(this.CACHE_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }
    return total;
  }

  /**
   * Compress data using LZString
   */
  private static compressData(data: unknown): string {
    return LZString.compress(JSON.stringify(data));
  }

  /**
   * Decompress data using LZString
   */
  private static decompressData<T>(compressed: string): T {
    const decompressed = LZString.decompress(compressed);
    if (!decompressed) {
      throw new Error('Failed to decompress cached data');
    }
    return JSON.parse(decompressed);
  }

  /**
   * Split large data into chunks for better localStorage handling
   */
  private static splitIntoChunks(data: string, chunkSize: number = this.MAX_CHUNK_SIZE): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Join chunks back into original data
   */
  private static joinChunks(chunks: string[]): string {
    return chunks.join('');
  }

  /**
   * Store large data by splitting into chunks
   */
  private static setChunkedData(key: string, data: string): boolean {
    try {
      const chunks = this.splitIntoChunks(data);
      const chunkCount = chunks.length;
      
      // Store metadata
      const metadataKey = `${this.CACHE_PREFIX}${key}_metadata`;
      localStorage.setItem(metadataKey, JSON.stringify({ chunkCount }));
      
      // Store each chunk
      for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${this.CACHE_PREFIX}${key}_chunk_${i}`;
        localStorage.setItem(chunkKey, chunks[i]);
      }
      
      return true;
    } catch (error) {
      console.error('Error storing chunked data:', error);
      return false;
    }
  }

  /**
   * Retrieve large data from chunks
   */
  private static getChunkedData(key: string): string | null {
    try {
      // Get metadata
      const metadataKey = `${this.CACHE_PREFIX}${key}_metadata`;
      const metadataStr = localStorage.getItem(metadataKey);
      if (!metadataStr) return null;
      
      const metadata = JSON.parse(metadataStr);
      const { chunkCount } = metadata;
      
      // Retrieve each chunk
      const chunks: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${this.CACHE_PREFIX}${key}_chunk_${i}`;
        const chunk = localStorage.getItem(chunkKey);
        if (chunk === null) return null; // Missing chunk
        chunks.push(chunk);
      }
      
      return this.joinChunks(chunks);
    } catch (error) {
      console.error('Error retrieving chunked data:', error);
      return null;
    }
  }

  /**
   * Clear chunked data
   */
  private static clearChunkedData(key: string): void {
    try {
      // Get metadata
      const metadataKey = `${this.CACHE_PREFIX}${key}_metadata`;
      const metadataStr = localStorage.getItem(metadataKey);
      if (!metadataStr) return;
      
      const metadata = JSON.parse(metadataStr);
      const { chunkCount } = metadata;
      
      // Clear metadata
      localStorage.removeItem(metadataKey);
      
      // Clear each chunk
      for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${this.CACHE_PREFIX}${key}_chunk_${i}`;
        localStorage.removeItem(chunkKey);
      }
    } catch (error) {
      console.error('Error clearing chunked data:', error);
    }
  }

  /**
   * Get cached data by key
   */
  static getCachedData(key: string): CacheEntry | null {
    try {
      const fullKey = this.CACHE_PREFIX + key;
      const cached = localStorage.getItem(fullKey);
      if (!cached) {
        // Try chunked data
        const chunkedData = this.getChunkedData(key);
        if (chunkedData) {
          return JSON.parse(chunkedData);
        }
        return null;
      }

      const entry: CacheEntry = JSON.parse(cached);
      return entry;
    } catch (error) {
      console.warn('Failed to retrieve cached data:', error);
      return null;
    }
  }

  /**
   * Store data in cache with compression
   */
  static setCachedData(key: string, data: unknown, version: string = this.DEFAULT_VERSION): boolean {
    try {
      const originalData = JSON.stringify(data);
      const compressedData = this.compressData(data);

      // Check if data is too large for single localStorage entry
      if (compressedData.length > this.MAX_CHUNK_SIZE) {
        console.log(`Data too large for single entry (${compressedData.length} bytes), using chunked storage`);
        const fullKey = this.CACHE_PREFIX + key;
        // Clear any existing single entry
        localStorage.removeItem(fullKey);
        // Store as chunks
        return this.setChunkedData(key, compressedData);
      }

      // Check if compressed data will fit
      if (!this.willFitInStorage(compressedData)) {
        console.warn(`Data too large for localStorage (${compressedData.length} bytes compressed)`);
        return false;
      }

      const entry: CacheEntry = {
        metadata: {
          timestamp: Date.now(),
          version,
          size: originalData.length,
          compressedSize: compressedData.length,
          compressed: true
        },
        data: compressedData
      };

      const fullKey = this.CACHE_PREFIX + key;
      // Clear any existing chunked data
      this.clearChunkedData(key);
      localStorage.setItem(fullKey, JSON.stringify(entry));

      console.log(`Cached data: ${key} (${originalData.length} → ${compressedData.length} bytes, ${(compressedData.length / originalData.length * 100).toFixed(1)}% of original)`);
      return true;
    } catch (error) {
      console.warn('Failed to cache data:', error);
      return false;
    }
  }

  /**
   * Check if cache entry is still valid
   */
  static isCacheValid(entry: CacheEntry, maxAgeMs: number): boolean {
    const age = Date.now() - entry.metadata.timestamp;
    const isExpired = age > maxAgeMs;

    if (isExpired) {
      console.log(`Cache expired: ${age}ms old (max: ${maxAgeMs}ms)`);
    }

    return !isExpired;
  }

  /**
   * Retrieve and decompress cached data
   */
  static getDecompressedData<T>(key: string): T | null {
    const entry = this.getCachedData(key);
    if (!entry) return null;

    try {
      return this.decompressData<T>(entry.data);
    } catch (error) {
      console.warn('Failed to decompress cached data:', error);
      this.clearCache(key); // Remove corrupted cache
      return null;
    }
  }

  /**
   * Clear specific cache entry or all cache entries
   */
  static clearCache(key?: string): void {
    try {
      if (key) {
        const fullKey = this.CACHE_PREFIX + key;
        localStorage.removeItem(fullKey);
        // Also clear chunked data
        this.clearChunkedData(key);
        console.log(`Cleared cache: ${key}`);
      } else {
        // Clear all cache entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const storageKey = localStorage.key(i);
          if (storageKey && storageKey.startsWith(this.CACHE_PREFIX)) {
            keysToRemove.push(storageKey);
          }
        }
        keysToRemove.forEach(storageKey => localStorage.removeItem(storageKey));
        console.log(`Cleared all cache entries (${keysToRemove.length} items)`);
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { entries: number; totalSize: number; usagePercent: number } {
    let entries = 0;
    let totalSize = 0;

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(this.CACHE_PREFIX)) {
        entries++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      }
    }

    // Estimate localStorage quota (rough approximation)
    const estimatedQuota = 5 * 1024 * 1024; // 5MB
    const usagePercent = (totalSize / estimatedQuota) * 100;

    return { entries, totalSize, usagePercent };
  }
}

/**
 * Specialized cache functions for HIFLD transmission line data
 */
export const HifldCache = {
  CACHE_KEY: 'hifld-transmission-lines',
  CACHE_VERSION: 'v3', // Incremented to force cache refresh for complete geographic coverage
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

  get(): TransmissionLine[] | null {
    const entry = CacheManager.getCachedData(this.CACHE_KEY);
    if (!entry) return null;

    // Check if cache is still valid
    if (!CacheManager.isCacheValid(entry, this.MAX_AGE_MS)) {
      return null;
    }

    return CacheManager.getDecompressedData<TransmissionLine[]>(this.CACHE_KEY);
  },

  set(data: TransmissionLine[]): boolean {
    return CacheManager.setCachedData(this.CACHE_KEY, data, this.CACHE_VERSION);
  },

  clear(): void {
    CacheManager.clearCache(this.CACHE_KEY);
  }
};

/**
 * Specialized cache functions for cable data
 */
export const CableCache = {
  CACHE_KEY: 'wfs-cable-data',
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours

  /**
   * Get cached cable data if valid
   */
  get(): Cable[] | null {
    const entry = CacheManager.getCachedData(this.CACHE_KEY);
    if (!entry) return null;

    if (!CacheManager.isCacheValid(entry, this.CACHE_DURATION)) {
      return null;
    }

    return CacheManager.getDecompressedData<Cable[]>(this.CACHE_KEY);
  },

  /**
   * Cache cable data
   */
  set(data: Cable[]): boolean {
    return CacheManager.setCachedData(this.CACHE_KEY, data, 'v1');
  },

  /**
   * Clear cable cache
   */
  clear(): void {
    CacheManager.clearCache(this.CACHE_KEY);
  }
};