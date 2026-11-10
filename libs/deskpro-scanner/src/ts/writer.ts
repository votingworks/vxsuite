import { Buffer } from 'node:buffer';
import { ProtocolError } from './protocol_error.js';

/** Appends little-endian primitives to a growable buffer. */
export class Writer {
  private readonly chunks: Buffer[] = [];

  private put(size: number, write: (buffer: Buffer) => void): this {
    const buffer = Buffer.allocUnsafe(size);
    write(buffer);
    this.chunks.push(buffer);
    return this;
  }

  u8(value: number): this {
    return this.put(1, (b) => b.writeUInt8(value));
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  u16(value: number): this {
    return this.put(2, (b) => b.writeUInt16LE(value));
  }

  u32(value: number): this {
    return this.put(4, (b) => b.writeUInt32LE(value));
  }

  i32(value: number): this {
    return this.put(4, (b) => b.writeInt32LE(value));
  }

  /** Writes an `int64_t`; the driver's values (sequence ids, counters) fit in a safe integer. */
  i64(value: number): this {
    if (!Number.isSafeInteger(value)) {
      throw new ProtocolError(`${value} is not a safe integer`);
    }
    return this.put(8, (b) => b.writeBigInt64LE(BigInt(value)));
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
