import { Buffer } from 'node:buffer';
import { ProtocolError } from './protocol_error.js';

/** Appends little-endian primitives to a growable buffer. */
export class Writer {
  private readonly chunks: Buffer[] = [];

  u8(value: number): this {
    this.chunks.push(Buffer.of(value));
    return this;
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  u16(value: number): this {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeUInt16LE(value);
    this.chunks.push(buffer);
    return this;
  }

  u32(value: number): this {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32LE(value);
    this.chunks.push(buffer);
    return this;
  }

  i32(value: number): this {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeInt32LE(value);
    this.chunks.push(buffer);
    return this;
  }

  /** Writes an `int64_t`; the driver's values (sequence ids, counters) fit in a safe integer. */
  i64(value: number): this {
    if (!Number.isSafeInteger(value)) {
      throw new ProtocolError(`${value} is not a safe integer`);
    }
    const buffer = Buffer.allocUnsafe(8);
    const high = Math.floor(value / 2 ** 32);
    buffer.writeUInt32LE(value - high * 2 ** 32, 0);
    buffer.writeInt32LE(high, 4);
    this.chunks.push(buffer);
    return this;
  }

  /** A `uint32` byte length followed by the UTF-8 bytes. */
  str(value: string): this {
    return this.bytes(Buffer.from(value, 'utf8'));
  }

  bytes(value: Buffer): this {
    this.u32(value.length);
    this.chunks.push(value);
    return this;
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
