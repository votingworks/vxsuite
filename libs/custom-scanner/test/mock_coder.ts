/**
 * Creates a mock coder.
 */

import { Coder } from '@votingworks/message-coder';
import { Mocked, vi } from 'vitest';

/* istanbul ignore next - @preserve */
function notImplemented() {
  throw new Error('not implemented');
}

/**
 * Creates a mock coder.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function mockCoder<T>(): Mocked<Coder<T>> {
  // due to overloads, we can't just use Mocked<Coder<T>>
  // but we can at least ensure we use the right keys
  const coder: Mocked<{ [K in keyof Coder<T>]: unknown }> = {
    canEncode: vi.fn().mockImplementation(notImplemented),
    default: vi.fn().mockImplementation(notImplemented),
    bitLength: vi.fn().mockImplementation(notImplemented),
    encode: vi.fn().mockImplementation(notImplemented),
    encodeInto: vi.fn().mockImplementation(notImplemented),
    decode: vi.fn().mockImplementation(notImplemented),
    decodeFrom: vi.fn().mockImplementation(notImplemented),
  };
  return coder as Mocked<Coder<T>>;
}
