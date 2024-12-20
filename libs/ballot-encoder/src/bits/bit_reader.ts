import { BitCursor } from './bit_cursor';
import { Uint1, Uint8, Uint8Size } from './types';
import { sizeof, makeMasks, toUint8 } from './utils';
import { Utf8Encoding, Encoding } from './encoding';

/**
 * Reads structured data from a `Uint8Array`. Data is read in little-endian
 * order.
 */
export class BitReader {
  private cursor = new BitCursor();

  /**
   * @param data a buffer to read data from
   */
  constructor(private readonly data: Uint8Array) {}

  /**
   * Reads a Uint1 and moves the internal cursor forward one bit.
   */
  readUint1(): Uint1 {
    const byte = this.getCurrentByte();
    const mask = this.cursor.mask();

    this.cursor.next();

    return (byte & mask) === 0 ? 0 : 1;
  }

  /**
   * Reads a number by reading 8 bits.
   */
  readUint8(): Uint8 {
    return this.readUint({ size: Uint8Size }) as Uint8;
  }

  /**
   * Reads a boolean by reading a bit and returning whether the bit was set.
   */
  readBoolean(): boolean {
    return this.readUint1() === 1;
  }

  /**
   * Reads a unsigned integer as a series of bits. There are two ways to control
   * the number of bytes `number` takes: provide a `max` value or provide a
   * `size`. If `max` is provided, then however many bytes would be required to
   * write `max` will be used to write `number`. If `size` is provided, then
   * that is how many bytes will be used.
   *
   * @example
   *
   * // contains 16 bits
   * const bits = new BitReader(Uint8Array.of(0xff, 0x0f))
   *
   * bits.readUint({ max: 0x0f })  // reads first 4 bits: 0x0f
   * bits.readUint({ size: 8 })    // reads next 8 bits:  0xf0
   * bits.readUint({ size: 4 })    // reads last 4 bits:  0x0f
   */
  readUint({ max }: { max: number }): number;
  readUint({ size }: { size: number }): number;
  readUint(options: { max: number } | { size: number }): number {
    const sizeofUint =
      // this is kinda ridiculous, but makes TS happy
      'max' in options ? this.sizeofUint(options) : this.sizeofUint(options);

    // Optimize for the case of reading a byte straight from the underlying buffer.
    if (sizeofUint === Uint8Size && this.cursor.isByteStart) {
      const result = this.getCurrentByte();
      this.cursor.advance(Uint8Size);
      return result;
    }

    // Fall back to reading bits individually.
    let result = 0;

    for (const mask of makeMasks(sizeofUint)) {
      const bit = this.readUint1();
      if (bit) {
        result |= mask;
      }
    }

    return result;
  }

  /**
   * Reads a string, either with a known length or by reading a length up to a
   * given maximum. By default, the encoding used will be UTF-8. If your string
   * has a restricted character set, you can use your own `CustomEncoding` to
   * read and write the string more compactly than you otherwise would be able
   * to.
   *
   * It is important to remember that the options must be the same for
   * `readString` and `writeString` calls, otherwise reading the string will
   * very likely fail or be corrupt.
   *
   * @example
   *
   *                                  // length  'h'  'i'
   *                                  //      ↓   ↓    ↓
   * const bits = new BitReader(Uint8Array.of(2, 104, 105))
   * bits.readString() // "hi"
   *
   *                                  // length  'h''i'
   *                                  //           ↓↓
   * const bits = new BitReader(Uint8Array.of(2, 0b01000000))
   * const encoding = new CustomEncoding('hi')    // ↑↑↑↑↑↑
   * bits.readString() // "hi"                       padding
   *
   *                                  //     'h'  'i'
   *                                  //      ↓    ↓
   * const bits = new BitReader(Uint8Array.of(104, 105))
   * bits.readString({ length: 2 }) // "hi"
   */
  readString(): string;
  readString(options: { encoding?: Encoding }): string;
  readString(options: { encoding?: Encoding; maxLength?: number }): string;

  readString(options: { encoding?: Encoding; length?: number }): string;
  readString({
    encoding = Utf8Encoding,
    maxLength = (1 << Uint8Size) - 1,
    length,
  }: {
    encoding?: Encoding;
    maxLength?: number;
    length?: number;
  } = {}): string {
    const lengthToRead = length ?? this.readUint({ max: maxLength });
    const codes = new Uint8Array(lengthToRead);

    for (let i = 0; i < lengthToRead; i += 1) {
      codes.set([this.readUint({ size: encoding.getBitsPerElement() })], i);
    }

    return encoding.decode(codes);
  }

  /**
   * Skips uint values if they match the next values to be read.
   *
   * @returns true if the uints matched and were skipped, false otherwise
   */
  skipUint(expected: number, { max }: { max: number }): boolean;
  skipUint(expected: number, { size }: { size: number }): boolean;
  skipUint(expected: number[], { max }: { max: number }): boolean;
  skipUint(expected: number[], { size }: { size: number }): boolean;
  skipUint(
    expected: number | number[],
    options: { max: number } | { size: number }
  ): boolean {
    const originalCursor = this.cursor.copy();
    const uints = Array.isArray(expected) ? expected : [expected];
    const sizeofUint =
      // this is kinda ridiculous, but makes TS happy
      'max' in options ? this.sizeofUint(options) : this.sizeofUint(options);

    for (const uint of uints) {
      if (
        !this.canRead(sizeofUint) ||
        uint !==
          // this is kinda ridiculous, but makes TS happy
          ('max' in options ? this.readUint(options) : this.readUint(options))
      ) {
        this.cursor = originalCursor;
        return false;
      }
    }

    return true;
  }

  private sizeofUint({ max }: { max: number }): number;
  private sizeofUint({ size }: { size: number }): number;
  private sizeofUint({ max, size }: { max?: number; size?: number }): number {
    if (typeof max !== 'undefined' && typeof size !== 'undefined') {
      throw new Error("cannot specify both 'max' and 'size' options");
    }

    if (typeof max !== 'undefined') {
      return sizeof(max);
    }

    if (typeof size === 'undefined') {
      throw new Error('size cannot be undefined');
    }

    return size;
  }

  /**
   * Skips N bits if they match the next N bits that would be read.
   *
   * @returns true if the bits matched and were skipped, false otherwise
   */
  skipUint1(...uint1s: number[]): boolean {
    return this.skipUint(uint1s, { size: 1 });
  }

  /**
   * Skips N bytes if they match the next N bytes that would be read.
   *
   * @returns true if the bytes matched and were skipped, false otherwise
   */
  skipUint8(...uint8s: number[]): boolean {
    return this.skipUint(uint8s, { size: Uint8Size });
  }

  /**
   * Determines whether there is any more data to read. If the result is
   * `false`, then any call to read data will throw an exception.
   */
  canRead(size = 1): boolean {
    const totalBits = this.data.length * Uint8Size;
    const readBits = this.cursor.combinedBitOffset;
    return readBits + size <= totalBits;
  }

  private getCurrentByte(): Uint8 {
    if (this.cursor.byteOffset >= this.data.length) {
      throw new Error(
        `end of buffer reached: byteOffset=${this.cursor.byteOffset} bitOffset=${this.cursor.bitOffset} data.length=${this.data.length}`
      );
    }

    return toUint8(this.data[this.cursor.byteOffset]);
  }
}
