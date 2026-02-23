import { EncodedSymbol } from './types';

export interface RoundRobinEncoder {
  readonly k: number;
  readonly blockSize: number;
  readonly dataLength: number;
  readonly dataHash: Uint8Array;
  nextSymbol(): EncodedSymbol;
}

/**
 * Simple round-robin encoder: splits data into K blocks and cycles through
 * them sequentially. The `seed` field carries the block index.
 */
export function createRoundRobinEncoder(
  data: Uint8Array,
  dataHash: Uint8Array,
  blockSize: number
): RoundRobinEncoder {
  const dataLength = data.length;
  const k = Math.ceil(dataLength / blockSize);
  const paddedLength = k * blockSize;
  const paddedData = new Uint8Array(paddedLength);
  paddedData.set(data);

  const sourceBlocks: Uint8Array[] = [];
  for (let i = 0; i < k; i++) {
    sourceBlocks.push(paddedData.slice(i * blockSize, (i + 1) * blockSize));
  }

  let counter = 0;

  return {
    k,
    blockSize,
    dataLength,
    dataHash,

    nextSymbol(): EncodedSymbol {
      const blockIndex = counter % k;
      counter++;
      return {
        seed: blockIndex,
        data: sourceBlocks[blockIndex],
      };
    },
  };
}
