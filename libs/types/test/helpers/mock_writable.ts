import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

/**
 * Mock writable stream.
 */
export interface MockWritable extends Writable {
  toBuffer(): Buffer;
  toString(): string;
  writes: ReadonlyArray<{ chunk: unknown; encoding?: string }>;
}

/**
 * Makes a mock writable stream.
 */
export function mockWritable(): MockWritable {
  const writable = new EventEmitter() as MockWritable;
  const writes: Array<{ chunk: unknown; encoding?: string }> = [];

  writable.writes = writes;
  writable.write = jest.fn((...args: unknown[]): boolean => {
    let chunk: unknown;
    let encoding: unknown;
    let callback: unknown;

    if (args.length === 3) {
      [chunk, encoding, callback] = args;
    } else if (args.length === 2 && typeof args[1] === 'function') {
      [chunk, callback] = args;
    } else if (args.length === 2) {
      [chunk, encoding] = args;
    } else {
      [chunk] = args;
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string');
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding });
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    return true;
  });

  writable.end = jest.fn((...args: unknown[]): MockWritable => {
    let chunk: unknown;
    let encoding: unknown;
    let callback: unknown;

    if (args.length === 3) {
      [chunk, encoding, callback] = args;
    } else if (args.length === 2 && typeof args[1] === 'function') {
      [chunk, callback] = args;
    } else if (args.length === 2) {
      [chunk, encoding] = args;
    } else {
      [callback] = args;
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string');
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding });
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    return writable;
  });

  writable.toBuffer = () =>
    writes.reduce(
      (result, { chunk }) =>
        Buffer.concat([result, Buffer.from(chunk as Buffer | string)]),
      Buffer.of()
    );

  writable.toString = () =>
    writes.reduce(
      (result, { chunk, encoding }) =>
        result +
        (typeof chunk === 'string'
          ? chunk
          : (chunk as Buffer).toString(encoding as BufferEncoding | undefined)),
      ''
    );

  return writable;
}
