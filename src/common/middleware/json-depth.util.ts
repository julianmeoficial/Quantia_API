/**
 * Reject JSON bodies deeper than `maxDepth` (DoS / parser abuse — S5).
 */
export function jsonDepth(value: unknown, maxDepth: number, depth = 0): number {
  if (value === null || typeof value !== 'object') {
    return depth;
  }
  if (depth >= maxDepth) {
    return depth + 1;
  }
  let deepest = depth;
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const child of entries) {
    deepest = Math.max(deepest, jsonDepth(child, maxDepth, depth + 1));
    if (deepest > maxDepth) {
      return deepest;
    }
  }
  return deepest;
}

export function assertJsonDepth(value: unknown, maxDepth: number): boolean {
  return jsonDepth(value, maxDepth) <= maxDepth;
}
