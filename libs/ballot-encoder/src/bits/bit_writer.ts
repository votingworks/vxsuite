import { BitCursor } from './bit_cursor';
import { Encoding, Utf8Encoding } from './encoding';
import { Uint1, Uint8, Uint8Size } from './types';
import { inGroupsOf, makeMasks, sizeof, toUint8 } from './utils';

/**
 * Writes structured data into a `Uint8Array`. Data is written in little-endian
 * order.
 */
export class BitWriter {
  private data = new Uint8Array();
  private readonly cursor = new BitCursor();
  private nextByte: Uint8 = 0b00000000;

  /**
   * Append `byte` to the internal buffer.
   */
  private appendByte(byte: Uint8): void {
    const nextData = new Uint8Array(this.data.length + 1);
    nextData.set(this.data);
    nextData[this.data.length] = byte;
    this.data = nextData;
  }

  /**
   * Writes bits.
   */
  writeUint1(...uint1s: Uint1[]): this {
    for (const uint1 of uint1s) {
      const mask = this.cursor.mask(uint1);
      this.nextByte |= mask;
      this.cursor.next();

      if (this.cursor.isByteStart) {
        this.appendByte(toUint8(this.nextByte));
        this.nextByte = 0b00000000;
      }
    }

    return this;
  }

  /**
   * Writes `1` if given `true`, `0` otherwise.
   */
  writeBoolean(...booleans: boolean[]): this {
    for (const boolean of booleans) {
      this.writeUint1(boolean ? 1 : 0);
    }

    return this;
  }

  /**
   * Writes data from a `Uint8` by writing 8 bits.
   */
  writeUint8(...uint8s: Uint8[]): this {
    for (const uint8 of uint8s) {
      this.writeUint(uint8, { size: Uint8Size });
    }
    return this;
  }

  /**
   * Writes an unsigned integer as a series of bits. There are two ways to
   * control the number of bytes `number` takes: provide a `max` value or
   * provide a `size`. If `max` is provided, then however many bytes would be
   * required to write `max` will be used to write `number`. If `size` is
   * provided, then that is how many bytes will be used.
   *
   * @example
   *
   * bits.writeUint(23, { max: 30 })  // writes `10111`
   * bits.writeUint(99, { size: 8 })  // writes `01100011`
   */
  writeUint(number: number, { max }: { max: number }): this;
  writeUint(number: number, { size }: { size: number }): this;
  writeUint(
    number: number,
    { max, size }: { max?: number; size?: number }
  ): this {
    if (typeof max !== 'undefined' && typeof size !== 'undefined') {
      throw new Error("cannot specify both 'max' and 'size' options");
    }

    if (typeof max !== 'undefined') {
      if (number > max) {
        throw new Error(`overflow: ${number} must be less than ${max}`);
      }

      return this.writeUint(number, { size: sizeof(max) });
    }

    if (typeof size === 'undefined') {
      throw new Error('size cannot be undefined');
    }

    if (number >= 2 ** size) {
      throw new Error(`overflow: ${number} cannot fit in ${size} bits`);
    }

    if (size === Uint8Size && this.cursor.isByteStart) {
      this.appendByte(toUint8(number));
      this.cursor.advance(Uint8Size);
    } else {
      for (const mask of makeMasks(size)) {
        this.writeUint1((number & mask) === 0 ? 0 : 1);
      }
    }

    return this;
  }

  /**
   * Writes string data either with a known length or length-prefixed up to a
   * maximum length. By default, the encoding used will be UTF-8. If your string
   * has a restricted character set, you can use your own `CustomEncoding` to
   * read and write the string more compactly than you otherwise would be able
   * to.
   *
   * It is important to remember that the options must match for `readString`
   * and `writeString` calls, otherwise reading the string will very likely fail
   * or be corrupt.
   *
   * @example
   *
   *                                              length=2 'h'      'i'
   *                                              ↓        ↓        ↓
   * bits.writeString('hi') // uses utf-8, writes 00000010 01101000 01101001
   *
   *                                                                        'h'      'i'
   *                                                                        ↓        ↓
   * bits.writeString('hi', { includeLength: false }) // uses utf-8, writes 01101000 01101001
   *
   * const encoding = new CustomEncoding('hi')
   * bits.writeString('hi', { maxLength: 4 }) // uses custom encoding, writes 1001
   *                                                                          ↑ ↑↑
   *                                                                   length=2 'h''i'
   */
  writeString(string: string): this;
  writeString(string: string, options: { encoding?: Encoding }): this;
  writeString(
    string: string,
    options: { encoding?: Encoding; includeLength: false; length: number }
  ): this;

  writeString(
    string: string,
    options: {
      encoding?: Encoding;
      includeLength?: true;
      maxLength?: number;
    }
  ): this;

  writeString(
    string: string,
    {
      encoding = Utf8Encoding,
      maxLength = 2 ** Uint8Size - 1,
      includeLength = true,
      length,
    }: {
      encoding?: Encoding;
      maxLength?: number;
      includeLength?: boolean;
      length?: number;
    } = {}
  ): this {
    const codes = encoding.encode(string);

    // write length
    if (includeLength) {
      if (codes.length > maxLength) {
        throw new Error(
          `overflow: cannot write a string longer than max length: ${string.length} > ${maxLength}`
        );
      }

      this.writeUint(codes.length, { max: maxLength });
    } else if (string.length !== length) {
      throw new Error(
        `string length (${string.length}) does not match known length (${length}); an explicit length must be provided when includeLength=false as a safe-guard`
      );
    }

    // write content
    for (const code of codes) {
      this.writeUint(code, { size: encoding.getBitsPerElement() });
    }

    return this;
  }

  /**
   * Calls back with this `BitWriter` to make chaining easier.
   *
   * @example
   *
   * return new BitWriter()
   *   .writeBoolean(true)
   *   .with(writer => encodeSomething(writer))
   *   .writeBoolean(false)
   */
  with(callback: (writer: this) => void): this {
    callback(this);
    return this;
  }

  /**
   * Converts the data written to this `BitWriter` to a `Uint8Array`.
   */
  toUint8Array(): Uint8Array {
    const pendingByte = this.getPendingByte();

    if (typeof pendingByte === 'undefined') {
      return Uint8Array.from(this.data);
    }

    const result = new Uint8Array(this.data.length + 1);
    result.set(this.data);
    result[this.data.length] = pendingByte;
    return result;
  }

  /**
   * If there's a byte that is not yet full, get it.
   */
  private getPendingByte(): Uint8 | undefined {
    if (this.cursor.isByteStart) {
      return undefined;
    }
    return this.nextByte;
  }

  debug(label?: string): this {
    if (label) {
      // eslint-disable-next-line no-console
      console.log(label);
    }
    // eslint-disable-next-line no-console
    console.log(
      inGroupsOf(
        8,
        inGroupsOf(
          Uint8Size,
          Array.from(this.toUint8Array())
            .map((n) => n.toString(2).padStart(Uint8Size, '0'))
            .join('')
            .slice(0, this.cursor.combinedBitOffset)
            .split('')
        )
      )
        .map((row) => row.map((cell) => cell.join('')).join(' '))
        .join('\n')
    );
    return this;
  }
}
