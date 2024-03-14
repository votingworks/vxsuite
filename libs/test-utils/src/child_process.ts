import { Buffer } from 'buffer';
import { mock } from 'bun:test';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

export interface FakeReadable extends Readable {
  append(chunk: string): void;
  end(): void;
}

export interface FakeWritable extends Writable {
  toBuffer(): Buffer;
  toString(): string;
  writes: ReadonlyArray<{ chunk: unknown; encoding?: string }>;
}

/**
 * Makes a fake readable stream.
 */
export function fakeReadable(): FakeReadable {
  const readable = new EventEmitter() as FakeReadable;
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

  readable.resume = mock(() => {
    isPaused = false;
    flush();
    return readable;
  });
  readable.pause = mock(() => {
    isPaused = true;
    return readable;
  });
  readable.isPaused = mock().mockImplementation(() => isPaused);
  readable.setEncoding = mock();
  readable.append = mock((chunk): void => {
    pendingChunks.push(chunk);
    if (!isPaused) {
      flush();
    }
  });
  readable.read = mock((size): unknown => {
    if (typeof buffer === 'string') {
      const readSize = size ?? buffer.length;
      const result = buffer.slice(0, readSize);
      buffer = buffer.length <= readSize ? undefined : buffer.slice(readSize);
      return result;
    }

    return undefined;
  });
  readable.end = mock(() => {
    readable.emit('end');
  });
  return readable;
}

/**
 * Makes a fake writable stream.
 */
export function fakeWritable(): FakeWritable {
  const writable = new EventEmitter() as FakeWritable;
  const writes: Array<{ chunk: unknown; encoding?: string }> = [];

  writable.writes = writes;
  writable.write = mock((...args: unknown[]): boolean => {
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

  writable.end = mock((...args: unknown[]): FakeWritable => {
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

export interface FakeChildProcess extends ChildProcess {
  stdin: FakeWritable;
  stdout: FakeReadable;
  stderr: FakeReadable;
}

/**
 * Creates a fake child process with fake streams.
 */
export function fakeChildProcess(): FakeChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: fakeWritable(),
    stdout: fakeReadable(),
    stderr: fakeReadable(),
    kill: mock(),
  };

  return Object.assign(new EventEmitter(), result) as FakeChildProcess;
}
