import fc from 'fast-check';
import { WriteInEncoding } from '../src';
import { BitReader, BitWriter, toUint8, Uint1, Uint8 } from '../src/bits';

export const writeInChar = fc
  .integer(0, WriteInEncoding.chars.length)
  .map((index) => WriteInEncoding.chars[index] ?? '');

export interface BooleanWritable {
  readonly type: 'boolean';
  readonly value: boolean;
}

export interface Uint1Writable {
  readonly type: 'uint1';
  readonly value: Uint1;
}

export interface Uint8Writable {
  readonly type: 'uint8';
  readonly value: Uint8;
}

export interface UintWritable {
  readonly type: 'uint';
  readonly value: number;
  readonly max: number;
}

export interface StringWritable {
  readonly type: 'string';
  readonly value: string;
  readonly maxLength?: number;
}

export type AnyWritable =
  | BooleanWritable
  | Uint1Writable
  | Uint8Writable
  | UintWritable
  | StringWritable;

export const writableBoolean = fc
  .boolean()
  .map<BooleanWritable>((value) => ({ type: 'boolean', value }));
export const writableUint1 = fc
  .boolean()
  .map<Uint1Writable>((value) => ({ type: 'uint1', value: value ? 1 : 0 }));
export const writableUint8 = fc
  .uint8Array({ minLength: 1, maxLength: 1 })
  .map<Uint8Writable>(([value]) => ({ type: 'uint8', value: toUint8(value) }));
export const writableUint = fc
  .tuple(fc.nat(), fc.nat())
  .map<[number, number]>(([a, b]) => (a <= b ? [a, b] : [b, a]))
  .map<UintWritable>(([value, max]) => ({ type: 'uint', value, max }));
export const writableString = fc
  .tuple(fc.string(), fc.option(fc.nat()))
  .map<StringWritable>(([value, max]) => ({
    type: 'string',
    value,
    maxLength: max === null ? undefined : Math.max(max, value.length),
  }));
export const anyWritable = fc.oneof<fc.Arbitrary<AnyWritable>[]>(
  writableBoolean,
  writableUint1,
  writableUint8,
  writableUint,
  writableString
);

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
