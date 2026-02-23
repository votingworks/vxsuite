import { createPrng } from '../fountain/prng';

/** Generate deterministic test data of the given size using a seeded PRNG */
export function generateTestData(seed: number, sizeBytes: number): Uint8Array {
  const rng = createPrng(seed);
  const data = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    data[i] = rng() & 0xff;
  }
  return data;
}

/** Compute SHA-256 hash of data and return the full hash as a Uint8Array */
export async function computeHash(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/** Get first 8 bytes of SHA-256 hash (for frame header) */
export async function computeTruncatedHash(
  data: Uint8Array
): Promise<Uint8Array> {
  const full = await computeHash(data);
  return full.slice(0, 8);
}

/** Convert Uint8Array to hex string for display */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
