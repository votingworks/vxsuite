import { expect, test } from 'vitest';
import fc from 'fast-check';
import { WriteInEncoding } from '../src';
import { BitReader, BitWriter, toUint8 } from '../src/bits';
import { anyWritable, doReads, doWrites, writeInChar } from './utils';

test('read/write booleans', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean()), (values) => {
      const writer = new BitWriter();
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
      const writer = new BitWriter();
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
      const writer = new BitWriter();
      writer.writeString(value);
      const reader = new BitReader(writer.toUint8Array());
      expect(reader.readString()).toEqual(value);
    })
  );
});

test('read/write write-ins', () => {
  fc.assert(
    fc.property(fc.stringOf(writeInChar), (writeIn) => {
      const writer = new BitWriter();
      writer.writeString(writeIn, { encoding: WriteInEncoding });
      const reader = new BitReader(writer.toUint8Array());
      expect(reader.readString({ encoding: WriteInEncoding })).toEqual(writeIn);
    })
  );
});

test('read/write various values', () => {
  fc.assert(
    fc.property(fc.array(anyWritable), (writables) => {
      const writer = new BitWriter();
      doWrites(writer, writables);

      const reader = new BitReader(writer.toUint8Array());
      doReads(reader, writables);
    })
  );
});
