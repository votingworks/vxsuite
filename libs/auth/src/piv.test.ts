import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { Byte } from '@votingworks/types';

import {
  construct8BytePinBuffer,
  isIncorrectPinStatusWord,
  isSecurityConditionNotSatisfiedStatusWord,
  numRemainingPinAttemptsFromIncorrectPinStatusWord,
  pivDataObjectId,
} from './piv';

test('pivDataObjectId', () => {
  expect(pivDataObjectId(0x00)).toEqual(Buffer.of(0x5f, 0xc1, 0x00));
});

test.each<{ pin: string; expectedBuffer: Buffer }>([
  {
    pin: '123456',
    expectedBuffer: Buffer.of(0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0xff, 0xff),
  },
  {
    pin: '12345678',
    expectedBuffer: Buffer.of(0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38),
  },
  {
    pin: '0000',
    expectedBuffer: Buffer.of(0x30, 0x30, 0x30, 0x30, 0xff, 0xff, 0xff, 0xff),
  },
  {
    pin: '',
    expectedBuffer: Buffer.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
  },
])('construct8BytePinBuffer', ({ pin, expectedBuffer }) => {
  expect(construct8BytePinBuffer(pin)).toEqual(expectedBuffer);
});

test('isIncorrectPinStatusWord', () => {
  expect(isIncorrectPinStatusWord([0x63, 0xc0])).toEqual(true);
  expect(isIncorrectPinStatusWord([0x63, 0xcf])).toEqual(true);
  expect(isIncorrectPinStatusWord([0x62, 0xc0])).toEqual(false);
  expect(isIncorrectPinStatusWord([0x64, 0xc0])).toEqual(false);
  expect(isIncorrectPinStatusWord([0x63, 0xb0])).toEqual(false);
  expect(isIncorrectPinStatusWord([0x63, 0xd0])).toEqual(false);
});

test('isSecurityConditionNotSatisfiedStatusWord', () => {
  expect(isSecurityConditionNotSatisfiedStatusWord([0x69, 0x82])).toEqual(true);
  expect(isSecurityConditionNotSatisfiedStatusWord([0x68, 0x82])).toEqual(
    false
  );
  expect(isSecurityConditionNotSatisfiedStatusWord([0x70, 0x82])).toEqual(
    false
  );
  expect(isSecurityConditionNotSatisfiedStatusWord([0x69, 0x81])).toEqual(
    false
  );
  expect(isSecurityConditionNotSatisfiedStatusWord([0x69, 0x83])).toEqual(
    false
  );
});

test.each<{ sw2: Byte; expectedNumRemainingPinAttempts: number }>([
  { sw2: 0xc0, expectedNumRemainingPinAttempts: 0 },
  { sw2: 0xc1, expectedNumRemainingPinAttempts: 1 },
  { sw2: 0xc2, expectedNumRemainingPinAttempts: 2 },
  { sw2: 0xc3, expectedNumRemainingPinAttempts: 3 },
  { sw2: 0xc4, expectedNumRemainingPinAttempts: 4 },
  { sw2: 0xc5, expectedNumRemainingPinAttempts: 5 },
  { sw2: 0xc6, expectedNumRemainingPinAttempts: 6 },
  { sw2: 0xc7, expectedNumRemainingPinAttempts: 7 },
  { sw2: 0xc8, expectedNumRemainingPinAttempts: 8 },
  { sw2: 0xc9, expectedNumRemainingPinAttempts: 9 },
  { sw2: 0xca, expectedNumRemainingPinAttempts: 10 },
  { sw2: 0xcb, expectedNumRemainingPinAttempts: 11 },
  { sw2: 0xcc, expectedNumRemainingPinAttempts: 12 },
  { sw2: 0xcd, expectedNumRemainingPinAttempts: 13 },
  { sw2: 0xce, expectedNumRemainingPinAttempts: 14 },
  { sw2: 0xcf, expectedNumRemainingPinAttempts: 15 },
])(
  'numRemainingPinAttemptsFromIncorrectPinStatusWord',
  ({ sw2, expectedNumRemainingPinAttempts }) => {
    expect(
      numRemainingPinAttemptsFromIncorrectPinStatusWord([0x63, sw2])
    ).toEqual(expectedNumRemainingPinAttempts);
  }
);

test('numRemainingPinAttemptsFromIncorrectPinStatusWord validation', () => {
  expect(() =>
    numRemainingPinAttemptsFromIncorrectPinStatusWord([0x90, 0x00])
  ).toThrow();
});
