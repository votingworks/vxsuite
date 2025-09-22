import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { BitReader, JsBitWriter, toUint8 } from '../npm/bits';
import { anyWritable, doReads, doWrites, writeInChar } from './utils';
import * as addon from '../npm/addon/bits/bit_writer';

describe.each([['JsBitWriter', JsBitWriter], ['BitWriter (Native)', addon.BitWriterNative]])("%s", (_, W) => {
  test('read/write booleans', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean()), (values) => {
        const writer = new W();
        for (const value of values) {
          writer.writeBoolean(value);
        }
        const reader = new BitReader(writer.toUint8Array());
        for (const value of values) {
          expect(reader.readBoolean()).toEqual(value);
        }
      })
    );
  });

  test('read/write bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array(), (values) => {
        const writer = new W();
        writer.writeUint8(...[...values].map(toUint8));
        const reader = new BitReader(writer.toUint8Array());
        for (const value of values) {
          expect(reader.readUint8()).toEqual(value);
        }
      })
    );
  });

  test('read/write strings', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const writer = new W();
        writer.writeUtf8String(value, { writeLength: true, maxLength: 255 });
        const reader = new BitReader(writer.toUint8Array());
        expect(reader.readUtf8String({ readLength: true, maxLength: 255 })).toEqual(value);
      })
    );
  });

  test('read/write write-ins', () => {
    fc.assert(
      fc.property(fc.stringOf(writeInChar), (writeIn) => {
        const writer = new W();
        writer.writeWriteInString(writeIn, { writeLength: true, maxLength: 255 });
        const reader = new BitReader(writer.toUint8Array());
        expect(reader.readWriteInString({ readLength: true, maxLength: 255 })).toEqual(writeIn);
      })
    );
  });

  test('read/write various values', () => {
    fc.assert(
      fc.property(fc.array(anyWritable), (writables) => {
        const writer = new W();
        doWrites(writer, writables);

        const reader = new BitReader(writer.toUint8Array());
        doReads(reader, writables);
      })
    );
  });
});
