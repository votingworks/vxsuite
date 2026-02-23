/**
 * Simple round-robin decoder: collects blocks by index until all K are received.
 * The `seed` field carries the block index directly.
 */

export interface RoundRobinDecoderState {
  readonly k: number;
  readonly blockSize: number;
  readonly decoded: (Uint8Array | null)[];
  numDecoded: number;
}

export function createRoundRobinDecoder(
  k: number,
  blockSize: number
): RoundRobinDecoderState {
  return {
    k,
    blockSize,
    decoded: new Array<Uint8Array | null>(k).fill(null),
    numDecoded: 0,
  };
}

export function addRoundRobinSymbol(
  state: RoundRobinDecoderState,
  seed: number,
  data: Uint8Array
): void {
  const blockIndex = seed;
  if (blockIndex < 0 || blockIndex >= state.k) return;
  if (state.decoded[blockIndex]) return; // Already have this block

  state.decoded[blockIndex] = new Uint8Array(data);
  state.numDecoded += 1;
}

export function isRoundRobinComplete(state: RoundRobinDecoderState): boolean {
  return state.numDecoded >= state.k;
}

export function reassembleRoundRobin(
  state: RoundRobinDecoderState,
  dataLength: number
): Uint8Array {
  const result = new Uint8Array(state.k * state.blockSize);
  for (let i = 0; i < state.k; i++) {
    if (state.decoded[i]) {
      result.set(state.decoded[i]!, i * state.blockSize);
    }
  }
  return result.slice(0, dataLength);
}
