import { EncodedSymbol, EncoderConfig, DEFAULT_ENCODER_CONFIG, SymbolEncoder } from './types';
import { createPrng, selectBlocks } from './prng';
import { buildRobustSolitonCdf, sampleDegree } from './distribution';

/** XOR two equal-length Uint8Arrays, writing result into `dst` */
function xorInto(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < dst.length; i++) {
    dst[i] ^= src[i];
  }
}

/**
 * Create an LT encoder for the given data.
 * `dataHash` must be provided (precomputed SHA-256 first 8 bytes).
 */
export function createEncoder(
  data: Uint8Array,
  dataHash: Uint8Array,
  config: Partial<EncoderConfig> = {}
): SymbolEncoder {
  const { blockSize, c, delta } = { ...DEFAULT_ENCODER_CONFIG, ...config };
  const dataLength = data.length;

  // Pad data to be evenly divisible by blockSize
  const k = Math.ceil(dataLength / blockSize);
  const paddedLength = k * blockSize;
  const paddedData = new Uint8Array(paddedLength);
  paddedData.set(data);

  // Split into source blocks
  const sourceBlocks: Uint8Array[] = [];
  for (let i = 0; i < k; i++) {
    sourceBlocks.push(paddedData.slice(i * blockSize, (i + 1) * blockSize));
  }

  // Build degree distribution CDF
  const cdf = buildRobustSolitonCdf(k, c, delta);

  let symbolCounter = 0;

  return {
    k,
    blockSize,
    dataLength,
    dataHash,

    nextSymbol(): EncodedSymbol {
      const seed = symbolCounter++;
      const rng = createPrng(seed);
      const degree = sampleDegree(cdf, rng);
      const blocks = selectBlocks(rng, degree, k);

      const symbolData = new Uint8Array(blockSize);
      for (const blockIdx of blocks) {
        xorInto(symbolData, sourceBlocks[blockIdx]);
      }

      return { seed, data: symbolData };
    },
  };
}
