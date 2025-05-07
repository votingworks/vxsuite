import { Buffer } from 'node:buffer';

/**
 * Creates an `ArrayBuffer` with the contents of the given `data`.
 */
export function arrayBufferFrom(data: Buffer | ArrayLike<number>): ArrayBuffer {
  if (Buffer.isBuffer(data)) {
    const arrayBuffer = new ArrayBuffer(data.byteLength);
    const buffer = new Uint8Array(arrayBuffer);
    data.copy(buffer);
    return arrayBuffer;
  }

  const arrayBuffer = new ArrayBuffer(data.length);
  const buffer = new Uint8Array(arrayBuffer);
  for (let i = 0; i < data.length; i += 1) {
    buffer[i] = data[i] as number;
  }
  return arrayBuffer;
}
