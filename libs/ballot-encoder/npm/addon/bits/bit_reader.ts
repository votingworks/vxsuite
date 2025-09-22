import { BitReader, ReadStringOptions, Uint1, Uint8 } from '../../bits/types';
import * as addon from '..';

/**
 * Writes structured data in big-endian order into a `Uint8Array`.
 */
export class BitReaderNative implements BitReader {
  private readonly inner: addon.BitReader;

  constructor(data: Uint8Array) {
    this.inner = addon.BitReader_new(data);
  }

  readUint1(): Uint1 {
    return addon.BitReader_readBoolean.call(this.inner) ? 1 : 0;
  }

  readUint8(): Uint8 {
    return addon.BitReader_readUint8.call(this.inner);
  }

  readBoolean(): boolean {
    return addon.BitReader_readBoolean.call(this.inner);
  }

  readUint({ max }: { max: number; }): number;
  readUint({ size }: { size: number; }): number;
  readUint(options: { max?: number; size?: number }): number {
    if (typeof options.max === 'number') {
      return addon.BitReader_readUintWithMax.call(this.inner, options.max);
    }

    if (typeof options.size === 'number') {
      return addon.BitReader_readUintWithSize.call(this.inner, options.size);
    }

    throw new Error(`Expected either 'max' or 'size' option`)
  }

  readUtf8String(options: ReadStringOptions): string {
    return addon.BitReader_readStringWithUtf8Encoding.call(this.inner, options.readLength ? options.maxLength : 0, options.readLength ? 0 : options.fixedLength)
  }

  readWriteInString(options: ReadStringOptions): string {
    return addon.BitReader_readStringWithWriteInEncoding.call(this.inner, options.readLength ? options.maxLength : 0, options.readLength ? 0 : options.fixedLength)
  }

  readHexString(options: ReadStringOptions): string {
    return addon.BitReader_readStringWithHexEncoding.call(this.inner, options.readLength ? options.maxLength : 0, options.readLength ? 0 : options.fixedLength);
  }

  skipUint(expected: number, { max }: { max: number; }): boolean;
  skipUint(expected: number, { size }: { size: number; }): boolean;
  skipUint(expected: number[], { max }: { max: number; }): boolean;
  skipUint(expected: number[], { size }: { size: number; }): boolean;
  skipUint(expected: unknown, __1: unknown): boolean {
    throw new Error('Method not implemented.');
  }

  skipUint1(...uint1s: number[]): boolean {
    throw new Error('Method not implemented.');
  }

  skipUint8(...uint8s: number[]): boolean {
    throw new Error('Method not implemented.');
  }

  canRead(size?: number): boolean {
    throw new Error('Method not implemented.');
  }
}
