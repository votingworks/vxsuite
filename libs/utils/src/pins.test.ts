import { mockOf } from '@votingworks/test-utils';
import fc from 'fast-check';
import randomBytes from 'randombytes';
import { Buffer } from 'buffer';

import { isFeatureFlagEnabled } from './features';
import {
  generatePin,
  hyphenatePin,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
} from './pins';

jest.mock('./features', (): typeof import('./features') => {
  return {
    ...jest.requireActual('./features'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

jest.mock('randombytes', (): typeof import('randombytes') => jest.fn());

function setMockRandomBytesResultOnce(pin: string) {
  const pinAsByteArray = Buffer.from(
    pin.split('').map((char) => Number.parseInt(char, 10))
  );
  mockOf(randomBytes).mockImplementationOnce(() => pinAsByteArray);
}

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
  mockOf(randomBytes).mockReset();
});

test('generatePin defaults to MIN_PIN_LENGTH', () => {
  setMockRandomBytesResultOnce('1029384756');
  expect(generatePin()).toHaveLength(MIN_PIN_LENGTH);
});

test('generatePin generates PINs of specified length', () => {
  setMockRandomBytesResultOnce('1020304050');
  expect(generatePin(7)).toBe('1020304');
});

test('generatePin throws on invalid PIN length', () => {
  expect(() => generatePin(0)).toThrow(/PIN length must be greater than \d/);
  expect(() => generatePin(-1)).toThrow(/PIN length must be greater than \d/);
  expect(() => generatePin(50)).toThrow(/PIN length must be less than \d/);
});

test('generatePIN generates PINs with all zeros when all-zero smartcard PIN generation feature flag is enabled', () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  fc.assert(
    fc.property(fc.integer(MIN_PIN_LENGTH, MAX_PIN_LENGTH), (length) => {
      const pin = generatePin(length);
      expect(pin).toMatch(/^[0]+$/);
      expect(pin).toHaveLength(length);
    })
  );
});

test('generatePin returns first non-weak random PINs', () => {
  const nonWeakPin = '551028';

  setMockRandomBytesResultOnce(nonWeakPin);
  setMockRandomBytesResultOnce('555555');
  setMockRandomBytesResultOnce('123456');

  expect(generatePin()).toBe(nonWeakPin);
  expect(mockOf(randomBytes)).toBeCalledTimes(1);
});

test('generatePin skips PINs with repeating digits', () => {
  const nonWeakPin = '223344';

  setMockRandomBytesResultOnce('555555');
  setMockRandomBytesResultOnce('122227');
  setMockRandomBytesResultOnce(nonWeakPin);

  expect(generatePin()).toBe(nonWeakPin);
});

test('generatePin skips PINs with long strings of sequential digits', () => {
  const nonWeakPin = '123789';

  setMockRandomBytesResultOnce('123456');
  setMockRandomBytesResultOnce('654321');
  setMockRandomBytesResultOnce(nonWeakPin);

  expect(generatePin()).toBe(nonWeakPin);
});

test('generatePin skips PINs with not enough digit variety', () => {
  const nonWeakPin = '204060';

  setMockRandomBytesResultOnce('121212');
  setMockRandomBytesResultOnce('363636');
  setMockRandomBytesResultOnce('188188');
  setMockRandomBytesResultOnce(nonWeakPin);

  expect(generatePin()).toBe(nonWeakPin);
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
