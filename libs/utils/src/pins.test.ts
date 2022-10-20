import { mockOf } from '@votingworks/test-utils';
import fc from 'fast-check';

import { isFeatureFlagEnabled } from './features';
import { generatePin, hyphenatePin } from './pins';

jest.mock('./features', (): typeof import('./features') => {
  return {
    ...jest.requireActual('./features'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
});

test('generatePin generates PINs', () => {
  const digitRegex = /^[0-9]+$/;

  // check default length
  expect(generatePin()).toHaveLength(6);

  fc.assert(
    fc.property(fc.integer(1, 100), (length) => {
      const pin = generatePin(length);
      expect(pin).toMatch(digitRegex);
      expect(pin).toHaveLength(length);
    })
  );

  expect(() => generatePin(0)).toThrow('PIN length must be greater than 0');
  expect(() => generatePin(-1)).toThrow('PIN length must be greater than 0');
});

test('generatePIN generates PINs with all zeros when all-zero smartcard PIN generation feature flag is enabled', () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  fc.assert(
    fc.property(fc.integer(1, 100), (length) => {
      const pin = generatePin(length);
      expect(pin).toMatch(/^[0]+$/);
      expect(pin).toHaveLength(length);
    })
  );
});

test('hyphenatePin hyphenates PINs', () => {
  expect(hyphenatePin('123456')).toEqual('123-456');
  expect(hyphenatePin('123456', 2)).toEqual('12-34-56');
  expect(hyphenatePin('123456', 4)).toEqual('1234-56');
  expect(hyphenatePin('123456', 6)).toEqual('123456');

  expect(() => hyphenatePin('123456', 0)).toThrow(
    'Segment length must be greater than 0'
  );
  expect(() => hyphenatePin('123456', -1)).toThrow(
    'Segment length must be greater than 0'
  );
});
