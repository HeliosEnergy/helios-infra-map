// String utility functions for fuzzy matching and text processing

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy string matching in search functionality
 */
export function levenshtein(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= a.length; j++) {
    for (let i = 1; i <= b.length; i++) {
      const indicator = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + indicator
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize string for better matching
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}