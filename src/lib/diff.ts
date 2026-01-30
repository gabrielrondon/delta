import { compare, Operation } from 'fast-json-patch';

/**
 * Compute JSON diff between two snapshots
 * @param oldData - Previous snapshot data
 * @param newData - Current snapshot data
 * @returns JSON Patch operations
 */
export function computeDiff(oldData: any, newData: any): Operation[] {
  return compare(oldData, newData);
}

/**
 * Count changes in a diff
 * @param diff - JSON Patch operations
 * @returns Number of changes
 */
export function countChanges(diff: Operation[]): number {
  return diff.length;
}

/**
 * Calculate similarity score between two objects
 * @param oldData - Previous snapshot data
 * @param newData - Current snapshot data
 * @returns Similarity score (0-1, where 1 is identical)
 */
export function calculateSimilarity(oldData: any, newData: any): number {
  const oldStr = JSON.stringify(oldData, Object.keys(oldData).sort());
  const newStr = JSON.stringify(newData, Object.keys(newData).sort());

  if (oldStr === newStr) return 1.0;

  // Simple similarity based on common substrings
  const maxLen = Math.max(oldStr.length, newStr.length);
  if (maxLen === 0) return 1.0;

  const commonLength = longestCommonSubstring(oldStr, newStr);
  return commonLength / maxLen;
}

/**
 * Find longest common substring length
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Length of longest common substring
 */
function longestCommonSubstring(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  let maxLen = 0;

  // Dynamic programming approach
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        maxLen = Math.max(maxLen, dp[i][j]);
      }
    }
  }

  return maxLen;
}

/**
 * Categorize changes by type
 * @param diff - JSON Patch operations
 * @returns Object with counts by operation type
 */
export function categorizeChanges(diff: Operation[]): {
  additions: number;
  deletions: number;
  modifications: number;
  total: number;
} {
  const additions = diff.filter((op) => op.op === 'add').length;
  const deletions = diff.filter((op) => op.op === 'remove').length;
  const modifications = diff.filter(
    (op) => op.op === 'replace' || op.op === 'copy' || op.op === 'move'
  ).length;

  return {
    additions,
    deletions,
    modifications,
    total: diff.length,
  };
}
