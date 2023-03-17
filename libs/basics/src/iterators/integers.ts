import { iter } from './iter';
import { IteratorPlus } from './types';

/**
 * Builds an infinite generator starting at 0 yielding successive integers.
 */
export function integers(): IteratorPlus<number>;
/**
 * Builds an infinite generator starting at `from` yielding successive integers.
 */
export function integers(opts: { from: number }): IteratorPlus<number>;
/**
 * Builds a generator starting at 0 up to and including `through`.
 */
export function integers(opts: { through: number }): IteratorPlus<number>;
/**
 * Builds a generator starting at `from` up to and including `through`.
 */
export function integers(opts: {
  from: number;
  through: number;
}): IteratorPlus<number>;
// eslint-disable-next-line vx/gts-jsdoc
export function integers({
  from = 0,
  through = Infinity,
}: { from?: number; through?: number } = {}): IteratorPlus<number> {
  return iter(
    (function* gen(): Generator<number> {
      for (let i = from; i <= through; i += 1) {
        yield i;
      }
    })()
  );
}
