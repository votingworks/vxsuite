import { Buffer } from 'node:buffer';
import { AsyncIteratorPlusImpl } from './async_iterator_plus';
import { IteratorPlusImpl } from './iterator_plus';
import { AsyncIteratorPlus, IteratorPlus } from './types';

interface ToString {
  toString(): string;
}

function matchAllNewlines(str: string): Iterable<RegExpMatchArray> {
  return str.matchAll(/\r?\n/g);
}

function linesSync(iterable: Iterable<ToString>): IteratorPlus<string> {
  let buffer = '';
  return new IteratorPlusImpl(
    (function* gen() {
      let hasSeenAnyChunks = false;

      for (const element of iterable) {
        const chunk = element.toString();
        let offset = 0;
        for (const newlineMatch of matchAllNewlines(chunk)) {
          /* istanbul ignore next - @preserve */
          if (typeof newlineMatch.index !== 'number') {
            throw new Error('expected index');
          }

          const line = buffer + chunk.slice(offset, newlineMatch.index);
          buffer = '';
          offset = newlineMatch.index + newlineMatch[0].length;
          yield line;
        }

        buffer += chunk.slice(offset);
        hasSeenAnyChunks = true;
      }

      if (hasSeenAnyChunks) {
        yield buffer;
      }
    })()
  );
}

function linesAsync(
  iterable: AsyncIterable<ToString>
): AsyncIteratorPlus<string> {
  let buffer = '';
  return new AsyncIteratorPlusImpl(
    (async function* gen() {
      let hasSeenAnyChunks = false;

      for await (const element of iterable) {
        const chunk = element.toString();
        let offset = 0;
        for (const newlineMatch of matchAllNewlines(chunk)) {
          /* istanbul ignore next - @preserve */
          if (typeof newlineMatch.index !== 'number') {
            throw new Error('expected index');
          }

          const line = buffer + chunk.slice(offset, newlineMatch.index);
          buffer = '';
          offset = newlineMatch.index + newlineMatch[0].length;
          yield line;
        }

        buffer += chunk.slice(offset);
        hasSeenAnyChunks = true;
      }

      if (hasSeenAnyChunks) {
        yield buffer;
      }
    })()
  );
}

/**
 * Pipes elements from `iterable` by collecting them together into a string
 * until a full line is formed, then yielding that line. The final line may or
 * may not include a newline.
 *
 * @example
 *
 * ```ts
 * const file = fs.createReadStream('file.txt', { encoding: 'utf8' });
 *
 * expect(await lines(file).toArray()).toEqual([
 *   'line 1\n',
 *   'line 2\n',
 *   …
 * ]);
 *
 * // or using `pipeline` from `stream`:
 *
 * await pipeline(
 *   fs.createReadStream('input.txt', { encoding: 'utf8' }),
 *   lines,
 *   async function* (source) {
 *     for await (const line of source) {
 *       yield `line: ${line}\n`;
 *     }
 *   },
 *  fs.createWriteStream('output.txt')
 * );
 * ```
 */
export function lines(
  iterable: AsyncIterable<ToString>
): AsyncIteratorPlus<string>;

/**
 * Pipes elements from `iterable` by collecting them together into a string
 * until a full line is formed, then yielding that line. The final line may or
 * may not include a newline.
 *
 * @example
 *
 * ```ts
 * const input = ['hello', ' world', '!', '\n', 'goodbye', 'world'];
 *
 * expect(lines(input).toArray()).toEqual([
 *   'hello world!\n',
 *   'goodbye world'
 * ]);
 * ```
 */
export function lines(
  iterable: string | Buffer | Iterable<ToString>
): IteratorPlus<string>;

/**
 * Pipes elements from `iterable` by collecting them together into a string
 * until a full line is formed, then yielding that line. The final line may or
 * may not include a newline.
 */
export function lines(
  iterable: string | Buffer | Iterable<ToString> | AsyncIterable<ToString>
): IteratorPlus<string> | AsyncIteratorPlus<string> {
  return typeof iterable === 'string' || Buffer.isBuffer(iterable)
    ? linesSync([iterable.toString()])
    : Symbol.iterator in iterable
    ? linesSync(iterable)
    : linesAsync(iterable);
}
