import { isResult, ok, Result } from '@votingworks/basics';
import { Buffer } from 'buffer';

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
  bitLength(value: T): BitLength;

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
 * Maps a `Result` to a new `Result` by applying a function to a contained `Ok`
 * value, leaving an `Err` value untouched.
 */
export function mapResult<T, U, E>(
  result: Result<T, CoderError>,
  fn: (value: T) => Result<U, E>
): Result<U, CoderError | E>;

/**
 * Maps a `Result` to a new `Result` by applying a function to a contained `Ok`
 * value and wrapping the result in an `Ok`, leaving an `Err` value untouched.
 */
export function mapResult<T, U>(
  result: Result<T, CoderError>,
  fn: (value: T) => U
): Result<U, CoderError>;

/**
 * Maps a `Result` to a new `Result` by applying a function to a contained `Ok`
 * value and optionally wrapping the result in an `Ok`, leaving an `Err` value
 * untouched.
 */
export function mapResult<T, U, E>(
  result: Result<T, CoderError>,
  fn: (value: T) => Result<U, E> | U
): Result<U, CoderError | E> {
  if (result.isErr()) {
    return result;
  }

  const mapped = fn(result.ok());
  return isResult(mapped) ? mapped : ok(mapped);
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
