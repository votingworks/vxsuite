/**
 * Seeded PRNG using a simple splitmix32 algorithm.
 * Both encoder and decoder use this to produce identical block selections
 * from the same seed.
 */

function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = (z ^ (z >>> 16)) * 0x85ebca6b;
    z = (z ^ (z >>> 13)) * 0xc2b2ae35;
    z = z ^ (z >>> 16);
    return z >>> 0;
  };
}

/** Create a seeded PRNG that returns uint32 values */
export function createPrng(seed: number): () => number {
  return splitmix32(seed);
}

/**
 * Select `degree` unique block indices from [0, k) using the given PRNG.
 * Uses a partial Fisher-Yates shuffle for efficiency.
 */
export function selectBlocks(
  rng: () => number,
  degree: number,
  k: number
): number[] {
  if (degree >= k) {
    return Array.from({ length: k }, (_, i) => i);
  }

  // For small degree relative to k, use rejection sampling
  if (degree <= k / 4) {
    const selected = new Set<number>();
    while (selected.size < degree) {
      selected.add(rng() % k);
    }
    return Array.from(selected).sort((a, b) => a - b);
  }

  // For larger degree, use Fisher-Yates partial shuffle
  const indices = Array.from({ length: k }, (_, i) => i);
  for (let i = 0; i < degree; i++) {
    const j = i + (rng() % (k - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, degree).sort((a, b) => a - b);
}
