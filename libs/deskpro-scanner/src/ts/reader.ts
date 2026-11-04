import type { Buffer } from 'node:buffer';
import { ProtocolError } from './protocol_error.js';

/** Reads little-endian primitives out of a payload, bounds-checking every read. */
export class Reader {
  private offset = 0;
  private readonly payload: Buffer;

  constructor(payload: Buffer) {
    this.payload = payload;
  }

  private take(wanted: number): Buffer {
    const available = this.payload.length - this.offset;
    if (wanted > available) {
      throw new ProtocolError(
        `truncated payload: wanted ${wanted} more bytes, ${available} available`
      );
    }
    const slice = this.payload.subarray(this.offset, this.offset + wanted);
    this.offset += wanted;
    return slice;
  }

  u8(): number {
    return this.take(1).readUInt8();
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    return this.take(2).readUInt16LE();
  }

  u32(): number {
    return this.take(4).readUInt32LE();
  }

  i32(): number {
    return this.take(4).readInt32LE();
  }

  /** @see {@link Writer.i64} for why this is a `number`. */
  i64(): number {
    const bytes = this.take(8);
    const value = bytes.readInt32LE(4) * 2 ** 32 + bytes.readUInt32LE(0);
    if (!Number.isSafeInteger(value)) {
      throw new ProtocolError(`int64 value ${value} does not fit in a number`);
    }
    return value;
  }

  str(): string {
    return this.bytes().toString('utf8');
  }

  /** A `u32`-length-prefixed subarray of the payload, not a copy. */
  bytes(): Buffer {
    return this.take(this.u32());
  }

  /** Throws if any bytes remain unread. */
  finish(): void {
    const remaining = this.payload.length - this.offset;
    if (remaining !== 0) {
      throw new ProtocolError(
        `${remaining} bytes of trailing data after a complete message`
      );
    }
  }
}
