import { integers } from './integers';
import { IteratorPlus } from './types';

/**
 * Builds an infinite generator starting at 1 yielding successive integers.
 */
export function naturals(): IteratorPlus<number> {
  return integers({ from: 1 });
}
