import { beforeEach, expect, test, vi } from 'vitest';
import { mockOf } from '@votingworks/test-utils';
import fc from 'fast-check';
import randomBytes from 'randombytes';
import { Buffer } from 'node:buffer';

import { isFeatureFlagEnabled } from './features';
import {
  generatePin,
  hyphenatePin,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
} from './pins';

vi.mock('./features', async () => ({
  ...(await vi.importActual('./features')),
  isFeatureFlagEnabled: vi.fn(),
}));

vi.mock('randombytes', () => ({ default: vi.fn() }));

const WEAK_PIN_EXAMPLES: string[] = [
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '122227',
  '588881',
  '129999',
  '123456',
  '654321',
  '012345',
  '543210',
  '456789',
  '987654',
  '121212',
  '363636',
  '555000',
  '883333',
  '188188',
  '200200',
];

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
  expect(generatePin(7)).toEqual('1020304');
});

test('generatePin throws on invalid PIN length', () => {
  expect(() => generatePin(0)).toThrow(
    /PIN length must be greater than or equal to \d/
  );
  expect(() => generatePin(-1)).toThrow(
    /PIN length must be greater than or equal to \d/
  );
  expect(() => generatePin(50)).toThrow(
    /PIN length must be less than or equal to \d/
  );
});

test('generatePIN generates PINs with all zeros when all-zero smart card PIN generation feature flag is enabled', () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  fc.assert(
    fc.property(fc.integer(MIN_PIN_LENGTH, MAX_PIN_LENGTH), (length) => {
      const pin = generatePin(length);
      expect(pin).toMatch(/^[0]+$/);
      expect(pin).toHaveLength(length);
    })
  );
});

test('generatePin returns first non-weak random PIN', () => {
  const nonWeakPin = '551028';

  setMockRandomBytesResultOnce(nonWeakPin);
  for (const weakPin of WEAK_PIN_EXAMPLES) {
    setMockRandomBytesResultOnce(weakPin);
  }

  expect(generatePin()).toEqual(nonWeakPin);
  expect(mockOf(randomBytes)).toBeCalledTimes(1);
});

test('generatePin skips weak PINs', () => {
  const nonWeakPin = '223344';

  for (const weakPin of WEAK_PIN_EXAMPLES) {
    setMockRandomBytesResultOnce(weakPin);
  }
  setMockRandomBytesResultOnce(nonWeakPin);

  expect(generatePin()).toEqual(nonWeakPin);
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
