import { Readable, Transform, Writable } from 'node:stream';

declare const split: unique symbol;
declare const overflow: unique symbol;
declare const underflow: unique symbol;

type StreamChopperType = typeof split | typeof overflow | typeof underflow;

interface StreamChopperOptions {
  /**
   * The maximum number of bytes that can be written to the chopper stream
   * before a new output stream is emitted (default: `Infinity`).
   */
  size?: number;

  /**
   * The maximum number of milliseconds that an output stream can be in use
   * before a new output stream is emitted (default: `-1` which means no limit).
   */
  time?: number;

  /**
   * Change the algorithm used to determine how a written chunk that cannot fit into the current output stream should be handled. The following values are possible:
   * - `StreamChopper.split` - Fit as much data from the chunk as possible into the current stream and write the remainder to the next stream (default).
   * - `StreamChopper.overflow` - Allow the entire chunk to be written to the current stream. After writing, the stream is ended.
   * - `StreamChopper.underflow` - End the current output stream and write the entire chunk to the next stream.
   */
  type?: StreamChopperType;

  /**
   * An optional function that returns a transform stream used for transforming
   * the data in some way (e.g. a zlib Gzip stream). If used, the size option
   * will count towards the size of the output chunks. This config option cannot
   * be used together with the `StreamChopper.split` type.
   */
  transform?: () => Transform;
}

/**
 * Instantiate a `StreamChopper` instance. `StreamChopper` is a writable stream.
 */
declare class StreamChopper extends Writable {
  static split: typeof split;
  static overflow: typeof overflow;
  static underflow: typeof underflow;

  constructor(options?: StreamChopperOptions);

  /**
   * The maximum number of bytes that can be written to the chopper stream
   * before a new output stream is emitted.
   *
   * Use this property to override it with a new value. The new value will take
   * effect immediately on the current stream.
   */
  size: number;

  /**
   * The maximum number of milliseconds that an output stream can be in use
   * before a new output stream is emitted.
   *
   * Use this property to override it with a new value. The new value will take
   * effect when the next stream is initialized. To change the current timer,
   * see `chopper.resetTimer()`.
   *
   * Set to -1 for no time limit.
   */
  time: number;

  /**
   * Change the algorithm used to determine how a written chunk that cannot fit into the current output stream should be handled. The following values are possible:
   * - `StreamChopper.split` - Fit as much data from the chunk as possible into the current stream and write the remainder to the next stream (default).
   * - `StreamChopper.overflow` - Allow the entire chunk to be written to the current stream. After writing, the stream is ended.
   * - `StreamChopper.underflow` - End the current output stream and write the entire chunk to the next stream.
   *
   * Use this property to override it with a new value. The new value will take effect immediately on the current stream.
   */
  type: StreamChopperType;

  /**
   * Emitted every time a new output stream is ready. You must listen for this
   * event.
   */
  on(
    event: 'stream',
    listener: (stream: Readable, next: (error?: unknown) => void) => void
  ): this;
  on(event: string, listener: (...args: any[]) => void): this;

  /**
   * Manually chop the stream. Forces the current output stream to end even if its size limit or time timeout hasn't been reached yet.
   *
   * @param callback An optional callback which will be called once the output stream have ended
   */
  chop(callback?: (error?: unknown) => void): void;

  /**
   * Use this function to reset the current timer (configured via the time
   * config option). Calling this function will force the current timer to start
   * over.
   *
   * If the optional time argument is provided, this value is used as the new
   * time. This is equivalent to calling:
   * 
   * ```ts
   * chopper.time = time
   * chopper.resetTimer()
   * ```
   */
  resetTimer(time?: number): void;
}

export = StreamChopper;
