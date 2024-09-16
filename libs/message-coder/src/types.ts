import { Result } from '@votingworks/basics';
import { Buffer } from 'node:buffer';

/**
 * Errors that can occur when encoding or decoding.
 */
export type CoderError =
  | 'SmallBuffer'
  | 'InvalidValue'
  | 'UnsupportedOffset'
  | 'TrailingData';

/**
 * Descriptive alias for `number`.
 */
export type BitOffset = number;

/**
 * Descriptive alias for `number`.
 */
export type ByteOffset = number;

/**
 * Descriptive alias for `number`.
 */
export type BitLength = number;

/**
 * Descriptive alias for `number`.
 */
export type ByteLength = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint2 = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint4 = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint8 = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint16 = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint24 = number;

/**
 * Descriptive alias for `number`.
 */
export type Uint32 = number;

/**
 * An encoder/decoder.
 */
export interface Coder<T> {
  /**
   * The default value for this coder, typically the value that is encoded as a
   * sequence of zero bits. Useful for building "blank" versions of a type for
   * test values or similar.
   */
  default(): T;

  /**
   * Determine whether a value can be encoded by this coder.
   */
  canEncode(value: unknown): value is T;

  /**
   * Encode a value as a buffer.
   */
  encode(value: T): Result<Buffer, CoderError>;

  /**
   * Decode a value from a buffer.
   */
  decode(buffer: Buffer): Result<T, CoderError>;

  /**
   * Calculate how many bits are needed to encode a value.
   */
  bitLength(value: T): Result<BitLength, CoderError>;

  /**
   * Encode a value into a buffer at a given bit offset.
   *
   * @param value the value to encode
   * @param buffer the buffer to encode into
   * @param bitOffset the bit offset to start encoding at
   * @returns the bit offset after the encoded value
   */
  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult;

  /**
   * Decode a value from a buffer at a given bit offset.
   *
   * @param buffer the buffer to decode from
   * @param bitOffset the bit offset to start decoding at
   * @returns the decoded value and the bit offset after the decoded value
   */
  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T>;
}

/**
 * Return value for `encodeInto`.
 */
export type EncodeResult = Result<BitOffset, CoderError>;

/**
 * `Ok` value for `decodeFrom`.
 */
export interface Decoded<T> {
  value: T;
  bitOffset: BitOffset;
}

/**
 * Return value for `decodeFrom`.
 */
export type DecodeResult<T> = Result<Decoded<T>, CoderError>;
