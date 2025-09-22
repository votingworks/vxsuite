import { BitWriter, Uint1, Uint8, WriteStringOptions } from '../../bits/types';
import * as addon from '..';

/**
 * Writes structured data in big-endian order into a `Uint8Array`.
 */
export class BitWriterNative implements BitWriter {
  private readonly inner: addon.BitWriter;

  constructor() {
    this.inner = addon.BitWriter_new();
  }

  writeUint1(...uint1s: Uint1[]): this {
    addon.BitWriter_writeUint1.call(this.inner, ...uint1s);
    return this;
  }

  writeBoolean(...booleans: boolean[]): this {
    addon.BitWriter_writeBoolean.call(this.inner, ...booleans);
    return this;
  }

  writeUint8(...uint8s: Uint8[]): this {
    addon.BitWriter_writeUint8.call(this.inner, ...uint8s);
    return this;
  }

  writeUint(number: number, { max }: { max: number; }): this;
  writeUint(number: number, { size }: { size: number; }): this;
  writeUint(number: number, { max, size }: { max?: number; size?: number; }): this {
    if (typeof max === 'number' && typeof size === 'number') {
      throw new Error("cannot specify both 'max' and 'size' options")
    }

    if (typeof max === 'undefined' && typeof size === 'undefined') {
      throw new Error("neither 'max' nor 'size' was given")
    }

    if (typeof max === 'number') {
      addon.BitWriter_writeUintWithMax.call(this.inner, number, max)
    } else if (typeof size === 'number') {
      addon.BitWriter_writeUintWithSize.call(this.inner, number, size)
    }

    return this;
  }

  writeUtf8String(string: string, options: WriteStringOptions): this {
    addon.BitWriter_writeStringWithUtf8Encoding.call(this.inner, string, options.writeLength, options.writeLength ? options.maxLength : 0);
    return this;
  }

  writeWriteInString(string: string, options: WriteStringOptions): this {
    addon.BitWriter_writeStringWithWriteInEncoding.call(this.inner, string, options.writeLength, options.writeLength ? options.maxLength : 0);
    return this;
  }

  writeHexString(string: string, options: WriteStringOptions): this {
    addon.BitWriter_writeStringWithHexEncoding.call(this.inner, string, options.writeLength, options.writeLength ? options.maxLength : 0);
    return this;
  }

  with(callback: (writer: this) => void): this {
    callback(this);
    return this;
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(addon.BitWriter_toBytes.call(this.inner));
  }
}
