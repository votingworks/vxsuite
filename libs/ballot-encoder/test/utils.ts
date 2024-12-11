import { expect } from 'vitest';
import fc from 'fast-check';
import { WriteInEncoding } from '../src';
import { BitReader, BitWriter, toUint8, Uint1, Uint8 } from '../src/bits';

/**
 * Generates arbitrary write-in characters.
 */
export const writeInChar = fc
  .integer(0, WriteInEncoding.getChars().length)
  .map((index) => WriteInEncoding.getChars()[index] ?? '');

/**
 * Represents a boolean value for testing arbitrarily-ordered writes and reads.
 */
export interface BooleanWritable {
  readonly type: 'boolean';
  readonly value: boolean;
}

/**
 * Represents a `Uint1` value for testing arbitrarily-ordered writes and reads.
 */
export interface Uint1Writable {
  readonly type: 'uint1';
  readonly value: Uint1;
}

/**
 * Represents a `Uint8` value for testing arbitrarily-ordered writes and reads.
 */
export interface Uint8Writable {
  readonly type: 'uint8';
  readonly value: Uint8;
}

/**
 * Represents a `Uint` value for testing arbitrarily-ordered writes and reads.
 */
export interface UintWritable {
  readonly type: 'uint';
  readonly value: number;
  readonly max: number;
}

/**
 * Represents a string value for testing arbitrarily-ordered writes and reads.
 */
export interface StringWritable {
  readonly type: 'string';
  readonly value: string;
  readonly maxLength?: number;
}

/**
 * Represents an arbitrary value for testing arbitrarily-ordered writes and
 * reads.
 */
export type AnyWritable =
  | BooleanWritable
  | Uint1Writable
  | Uint8Writable
  | UintWritable
  | StringWritable;

/**
 * Generates a boolean value for testing arbitrarily-ordered writes and reads.
 */
export const writableBoolean = fc
  .boolean()
  .map<BooleanWritable>((value) => ({ type: 'boolean', value }));

/**
 * Generates a `Uint1` value for testing arbitrarily-ordered writes and reads.
 */
export const writableUint1 = fc
  .boolean()
  .map<Uint1Writable>((value) => ({ type: 'uint1', value: value ? 1 : 0 }));

/**
 * Generates a `Uint8` value for testing arbitrarily-ordered writes and reads.
 */
export const writableUint8 = fc
  .uint8Array({ minLength: 1, maxLength: 1 })
  .map<Uint8Writable>(([value]) => ({ type: 'uint8', value: toUint8(value) }));

/**
 * Generates a `Uint` value for testing arbitrarily-ordered writes and reads.
 */
export const writableUint = fc
  .tuple(fc.nat(), fc.nat())
  .map<[number, number]>(([a, b]) => (a <= b ? [a, b] : [b, a]))
  .map<UintWritable>(([value, max]) => ({ type: 'uint', value, max }));

/**
 * Generates a string value for testing arbitrarily-ordered writes and reads.
 */
export const writableString = fc
  .tuple(fc.string(), fc.option(fc.nat()))
  .map<StringWritable>(([value, max]) => ({
    type: 'string',
    value,
    maxLength: max === null ? undefined : Math.max(max, value.length),
  }));

/**
 * Generates an arbitrary value for testing arbitrarily-ordered writes and
 * reads.
 */
export const anyWritable = fc.oneof<Array<fc.Arbitrary<AnyWritable>>>(
  writableBoolean,
  writableUint1,
  writableUint8,
  writableUint,
  writableString
);

/**
 * Writes all `writables` to `writer` in the order given. This is paired with
 * {@link doReads} to verify that the values round-trip correctly.
 */
export function doWrites(
  writer: BitWriter,
  writables: readonly AnyWritable[]
): void {
  for (const writable of writables) {
    switch (writable.type) {
      case 'boolean':
        writer.writeBoolean(writable.value);
        break;

      case 'uint1':
        writer.writeUint1(writable.value);
        break;

      case 'uint8':
        writer.writeUint8(writable.value);
        break;

      case 'uint':
        writer.writeUint(writable.value, { max: writable.max });
        break;

      case 'string':
        writer.writeString(writable.value, {
          maxLength: writable.maxLength,
        });
        break;

      /* istanbul ignore next */
      default:
        // @ts-expect-error - compile-time check on `writable`
        throw new Error(`unknown writable type: ${writable.type}`);
    }
  }
}

/**
 * Reads values of types from `writables` in order from `reader`, comparing them
 * to the values from `writables`.
 */
export function doReads(
  reader: BitReader,
  writables: readonly AnyWritable[]
): void {
  for (const writable of writables) {
    switch (writable.type) {
      case 'boolean':
        expect(reader.readBoolean()).toEqual(writable.value);
        break;

      case 'uint1':
        expect(reader.readUint1()).toEqual(writable.value);
        break;

      case 'uint8':
        expect(reader.readUint8()).toEqual(writable.value);
        break;

      case 'uint':
        expect(reader.readUint({ max: writable.max })).toEqual(writable.value);
        break;

      case 'string':
        expect(reader.readString({ maxLength: writable.maxLength })).toEqual(
          writable.value
        );
        break;

      /* istanbul ignore next */
      default:
        // @ts-expect-error - compile-time check on `writable`
        throw new Error(`unknown writable type: ${writable.type}`);
    }
  }
}
