import * as util from 'node:util';
import { BinaryToTextEncoding, Hash } from 'node:crypto';
import { Transform, TransformCallback } from 'node:stream';

import { assert } from '@votingworks/basics';

/**
 * Pipes an input stream to an output stream, unchanged, hashing each chunk
 * along the way.
 *
 * NOTE: Not a sink - must be piped to an output stream to avoid hangs when the
 * buffer is full. Use `node:crypto/createHash` directly if no passthrough is
 * needed.
 *
 * ### Example
 * ```ts
 * async function writeAndHash(hugeStream: Readable, outputPath: string) {
 *   const hashingStream = new HashingPassthrough(createHash('sha256'));
 *   await pipeline(hugeStream, hashingStream, createWriteStream(outputPath));
 *
 *   return hashingStream.digest('hex');
 * }
 * ```
 */
export class HashingPassthrough extends Transform {
  private hashComplete = false;

  constructor(private readonly hash: Hash) {
    super();
  }

  /**
   * @see {@link Hash.digest}
   * @throws if called before input stream ends or if called more than once.
   */
  digest(encoding: BinaryToTextEncoding): string {
    assert(this.hashComplete, 'digest requested on incomplete hash');
    return this.hash.digest(encoding);
  }

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    try {
      this.hash.update(chunk);
    } catch (e) {
      return callback(e instanceof Error ? e : new Error(util.inspect(e)));
    }

    callback(null, chunk);
  }

  _flush(callback: TransformCallback): void {
    this.hashComplete = true;
    callback();
  }
}
