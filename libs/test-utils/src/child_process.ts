import { Buffer } from 'node:buffer';
import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';

export interface MockReadable extends Readable {
  append(chunk: string): void;
  end(): void;
}

export interface MockWritable extends Writable {
  toBuffer(): Buffer;
  toString(): string;
  writes: ReadonlyArray<{ chunk: unknown; encoding?: string }>;
}

/**
 * Makes a mock readable stream.
 */
export function mockReadable(): MockReadable {
  const readable = new EventEmitter() as MockReadable;
  let buffer: string | undefined;
  let isPaused = false;
  let pendingChunks: unknown[] = [];

  function flush(): void {
    for (const chunk of pendingChunks) {
      buffer = (buffer ?? '') + chunk;
      readable.emit('readable');
      readable.emit('data', chunk);
    }
    pendingChunks = [];
  }

  readable.resume = () => {
    isPaused = false;
    flush();
    return readable;
  };
  readable.pause = () => {
    isPaused = true;
    return readable;
  };
  readable.isPaused = () => isPaused;
  readable.setEncoding = () => readable;
  readable.append = (chunk: unknown): void => {
    pendingChunks.push(chunk);
    if (!isPaused) {
      flush();
    }
  };
  readable.read = (size?: number): unknown => {
    if (typeof buffer === 'string') {
      const readSize = size ?? buffer.length;
      const result = buffer.slice(0, readSize);
      buffer = buffer.length <= readSize ? undefined : buffer.slice(readSize);
      return result;
    }

    return undefined;
  };
  readable.end = () => {
    readable.emit('end');
  };
  return readable;
}

/**
 * Makes a mock writable stream.
 */
export function mockWritable(): MockWritable {
  const writable = new EventEmitter() as MockWritable;
  const writes: Array<{ chunk: unknown; encoding?: string }> = [];

  writable.writes = writes;
  writable.write = (...args: unknown[]): boolean => {
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
  };

  writable.end = (...args: unknown[]): MockWritable => {
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
  };

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

export interface MockChildProcess extends ChildProcess {
  stdin: MockWritable;
  stdout: MockReadable;
  stderr: MockReadable;
}

/**
 * Creates a mock child process with mock streams.
 */
export function mockChildProcess(): MockChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: mockWritable(),
    stdout: mockReadable(),
    stderr: mockReadable(),
    kill: () => true,
  };

  return Object.assign(new EventEmitter(), result) as MockChildProcess;
}
