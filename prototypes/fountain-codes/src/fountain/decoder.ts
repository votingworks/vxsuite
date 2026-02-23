import { DecoderState, EncoderConfig, DEFAULT_ENCODER_CONFIG } from './types';
import { createPrng, selectBlocks } from './prng';
import { buildRobustSolitonCdf, sampleDegree } from './distribution';

/** XOR two equal-length Uint8Arrays, writing result into `dst` */
function xorInto(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < dst.length; i++) {
    dst[i] ^= src[i];
  }
}

/** Create a fresh decoder state */
export function createDecoder(k: number, blockSize: number): DecoderState {
  return {
    k,
    blockSize,
    decoded: new Array<Uint8Array | null>(k).fill(null),
    numDecoded: 0,
    symbols: [],
  };
}

/** Check if all source blocks have been decoded */
export function isComplete(state: DecoderState): boolean {
  return state.numDecoded >= state.k;
}

/**
 * Add a received symbol to the decoder and run belief propagation.
 * Uses the symbol's seed to reconstruct which source blocks it covers.
 */
export function addSymbol(
  state: DecoderState,
  seed: number,
  data: Uint8Array,
  config: Partial<EncoderConfig> = {}
): void {
  if (isComplete(state)) return;

  const { c, delta } = { ...DEFAULT_ENCODER_CONFIG, ...config };
  const cdf = buildRobustSolitonCdf(state.k, c, delta);
  const rng = createPrng(seed);
  const degree = sampleDegree(cdf, rng);
  const blockIndices = selectBlocks(rng, degree, state.k);

  // Make a mutable copy of the symbol data
  const symbolData = new Uint8Array(data);

  // XOR out already-decoded blocks
  const remaining: number[] = [];
  for (const idx of blockIndices) {
    if (state.decoded[idx]) {
      xorInto(symbolData, state.decoded[idx]!);
    } else {
      remaining.push(idx);
    }
  }

  if (remaining.length === 0) {
    // All blocks already decoded, symbol is redundant
    return;
  }

  if (remaining.length === 1) {
    // This symbol directly decodes a block
    resolveBlock(state, remaining[0], symbolData);
  } else {
    // Buffer for later resolution
    state.symbols.push({ blockIndices: remaining, data: symbolData });
  }
}

/**
 * Mark a block as decoded and propagate to buffered symbols.
 */
function resolveBlock(
  state: DecoderState,
  blockIdx: number,
  blockData: Uint8Array
): void {
  if (state.decoded[blockIdx]) return; // Already decoded

  state.decoded[blockIdx] = blockData;
  state.numDecoded += 1;

  // Propagate: check all buffered symbols
  const toResolve: Array<{ index: number; blockIdx: number }> = [];

  for (let i = state.symbols.length - 1; i >= 0; i--) {
    const sym = state.symbols[i];
    const pos = sym.blockIndices.indexOf(blockIdx);
    if (pos === -1) continue;

    // XOR out the newly decoded block
    xorInto(sym.data, blockData);
    sym.blockIndices.splice(pos, 1);

    if (sym.blockIndices.length === 1) {
      // This symbol now decodes another block
      toResolve.push({ index: i, blockIdx: sym.blockIndices[0] });
    } else if (sym.blockIndices.length === 0) {
      // Fully resolved, remove
      state.symbols.splice(i, 1);
    }
  }

  // Resolve newly-decodable symbols (remove from buffer first to avoid re-processing)
  // Sort by index descending so splice indices remain valid
  toResolve.sort((a, b) => b.index - a.index);
  const resolveEntries: Array<{ blockIdx: number; data: Uint8Array }> = [];
  for (const { index, blockIdx: bIdx } of toResolve) {
    const sym = state.symbols[index];
    resolveEntries.push({ blockIdx: bIdx, data: sym.data });
    state.symbols.splice(index, 1);
  }

  for (const entry of resolveEntries) {
    resolveBlock(state, entry.blockIdx, entry.data);
  }
}

/** Reassemble decoded blocks into the original data */
export function reassemble(
  state: DecoderState,
  dataLength: number
): Uint8Array {
  const result = new Uint8Array(state.k * state.blockSize);
  for (let i = 0; i < state.k; i++) {
    if (state.decoded[i]) {
      result.set(state.decoded[i]!, i * state.blockSize);
    }
  }
  // Trim to original data length
  return result.slice(0, dataLength);
}
