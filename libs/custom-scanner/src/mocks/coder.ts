/**
 * Creates a mock coder.
 */

import { Coder } from '@votingworks/message-coder';

/* istanbul ignore next */
function notImplemented() {
  throw new Error('not implemented');
}

/**
 * Creates a mock coder.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function mockCoder<T>(): jest.Mocked<Coder<T>> {
  return {
    default: jest.fn().mockImplementation(notImplemented),
    bitLength: jest.fn().mockImplementation(notImplemented),
    encode: jest.fn().mockImplementation(notImplemented),
    encodeInto: jest.fn().mockImplementation(notImplemented),
    decode: jest.fn().mockImplementation(notImplemented),
    decodeFrom: jest.fn().mockImplementation(notImplemented),
  };
}
