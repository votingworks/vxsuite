import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BitOffset, EncodeResult } from './types';

/**
 * How many bits are in a byte.
 */
export const BITS_PER_BYTE = 8;

/**
 * Calculates the number of bytes required to store the given number of bits.
 */
export function toByteLength(bits: number): number {
  return Math.ceil(bits / BITS_PER_BYTE);
}

/**
 * Calculates the number of bits required to store the given number of bytes.
 */
export function toBitLength(bytes: number): number {
  return bytes * BITS_PER_BYTE;
}

/**
 * Calculates the byte offset for the given bit offset. Throws if the bit offset
 * is not byte aligned.
 */
export function toByteOffset(bitOffset: BitOffset): EncodeResult {
  if (bitOffset % BITS_PER_BYTE !== 0) {
    return err('UnsupportedOffset');
  }

  return ok(bitOffset / BITS_PER_BYTE);
}

/**
 * Calculates the bit offset for the given byte offset.
 */
export function toBitOffset(byteOffset: number): number {
  return byteOffset * BITS_PER_BYTE;
}

/**
 * Determines if the given buffer contains the given bit offset and bit length.
 */
export function bufferContainsBitOffset(
  buffer: Buffer,
  bitOffset: BitOffset,
  bitLength = 0
): boolean {
  return toByteLength(bitOffset + bitLength) <= buffer.byteLength;
}
