import { describe, expect, test } from 'vitest';
import { JsBitWriter } from './bit_writer';
import * as addon from '../addon/bits/bit_writer';

describe.each([['JsBitWriter', JsBitWriter], ['BitWriter (Addon)', addon.BitWriterNative]])("%s", (_, W) => {
  test('can write a bit', () => {
    expect(new W().writeUint1(1).toUint8Array()).toEqual(
      Uint8Array.of(0b10000000)
    );
  });

  test('can write a byte', () => {
    expect(new W().writeUint8(0b10101010).toUint8Array()).toEqual(
      Uint8Array.of(0b10101010)
    );
  });

  test('can write multiple bits', () => {
    expect(
      new W().writeUint1(1).writeUint1(0).writeUint1(1).toUint8Array()
    ).toEqual(Uint8Array.of(0b10100000));
  });

  test('can write multiple bytes', () => {
    expect(
      new W().writeUint8(0b00010110).writeUint8(0b11110000).toUint8Array()
    ).toEqual(Uint8Array.of(0b00010110, 0b11110000));
  });

  test('writes a boolean by writing a bit', () => {
    expect(
      new W()
        .writeBoolean(true)
        .writeBoolean(false)
        .writeBoolean(true)
        .toUint8Array()
    ).toEqual(Uint8Array.of(0b10100000));
  });

  test('can write a non-aligned byte after writing a bit', () => {
    expect(
      new W().writeUint1(1).writeUint8(0b00001110).toUint8Array()
    ).toEqual(Uint8Array.of(0b10000111, 0b00000000));
  });

  test('can write a utf-8 string', () => {
    expect(new W().writeUtf8String('abcdé', { includeLength: true, maxLength: 255 }).toUint8Array()).toEqual(
      Uint8Array.of(
        6,
        0b01100001,
        0b01100010,
        0b01100011,
        0b01100100,
        0b11000011,
        0b10101001
      )
    );
  });

  test('can write a utf-8 string without a preceding length', () => {
    expect(
      new W()
        .writeUtf8String('abcdé', { includeLength: false })
        .toUint8Array()
    ).toEqual(
      Uint8Array.of(
        0b01100001,
        0b01100010,
        0b01100011,
        0b01100100,
        0b11000011,
        0b10101001
      )
    );
  });

  test('can write a hex-encoded string', () => {
    expect(new W().writeHexString(Buffer.of(1, 2).toString('hex'), { includeLength: false }).toUint8Array()).toEqual(Uint8Array.of(1, 2))
  })

  test('can write a write-in-encoded string', () => {
    expect(new W().writeWriteInString("BOB", { includeLength: true, maxLength: 40 }).toUint8Array()).toEqual(Uint8Array.of())
  })

  test('can write a non-aligned utf-8 string after writing a bit', () => {
    expect(
      new W().writeUint1(1).writeUtf8String('abc', { includeLength: true, maxLength: 255 }).toUint8Array()
    ).toEqual(
      Uint8Array.of(0b10000001, 0b10110000, 0b10110001, 0b00110001, 0b10000000)
    );
  });

  test('cannot write a uint with both `max` and `size` options', () => {
    expect(() => {
      // @ts-expect-error - intentional error to check assertion
      const options: { max: number } = { max: 1, size: 2 };
      new W().writeUint(0, options);
    }).toThrowError("cannot specify both 'max' and 'size' options");
  });

  test('cannot write a uint greater than the `max` option', () => {
    expect(() => {
      new W().writeUint(1, { max: 0 });
    }).toThrowError('overflow: 1 must be less than 0');
  });

  test('cannot write a uint without `max` or `size`', () => {
    expect(() => {
      // @ts-expect-error - intentional error to check assertion
      const options: { max: number } = {};
      new W().writeUint(1, options);
    }).toThrowError();
  });

  test('cannot write a uint that requires more bits than `size` option', () => {
    expect(() => {
      new W().writeUint(4, { size: 2 });
    }).toThrowError('overflow: 4 cannot fit in 2 bits');
  });

  test('fails to write a string that is longer than the maximum length', () => {
    expect(() => new W().writeUtf8String('a', { includeLength: true, maxLength: 0 })).toThrowError(
      'overflow: cannot write a string longer than max length: 1 > 0'
    );
  });

  test('perf', () => {
    const writer = new W();
    for (let i = 0; i < 1_000_000; i += 1) {
      writer.writeBoolean(i % 2 === 0);
    }
    expect(writer.toUint8Array().byteLength).toEqual(Math.ceil(1_000_000 / 8))
  })
});

