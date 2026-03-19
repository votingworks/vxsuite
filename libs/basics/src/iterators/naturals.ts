import { integers } from './integers.js';
import { IteratorPlus } from './types.js';

/**
 * Builds an infinite generator starting at 1 yielding successive integers.
 */
export function naturals(): IteratorPlus<number> {
  return integers({ from: 1 });
}
