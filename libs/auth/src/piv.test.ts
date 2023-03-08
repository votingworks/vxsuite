import { Buffer } from 'buffer';
import { Byte } from '@votingworks/types';

import {
  construct8BytePinBuffer,
  isIncorrectPinStatusWord,
  numRemainingAttemptsFromIncorrectPinStatusWord,
  pivDataObjectId,
} from './piv';

test('pivDataObjectId', () => {
  expect(pivDataObjectId(0x00)).toEqual(Buffer.from([0x5f, 0xc1, 0x00]));
});

test.each<{ pin: string; expectedBuffer: Buffer }>([
  {
    pin: '123456',
    expectedBuffer: Buffer.from([
      0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0xff, 0xff,
    ]),
  },
  {
    pin: '12345678',
    expectedBuffer: Buffer.from([
      0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
    ]),
  },
  {
    pin: '0000',
    expectedBuffer: Buffer.from([
      0x30, 0x30, 0x30, 0x30, 0xff, 0xff, 0xff, 0xff,
    ]),
  },
  {
    pin: '',
    expectedBuffer: Buffer.from([
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]),
  },
])('construct8BytePinBuffer', ({ pin, expectedBuffer }) => {
  expect(construct8BytePinBuffer(pin)).toEqual(expectedBuffer);
});

test('isIncorrectPinStatusWord', () => {
  expect(isIncorrectPinStatusWord([0x63, 0xc0])).toEqual(true);
  expect(isIncorrectPinStatusWord([0x63, 0xcf])).toEqual(true);
  expect(isIncorrectPinStatusWord([0x73, 0xc0])).toEqual(false);
  expect(isIncorrectPinStatusWord([0x64, 0xc0])).toEqual(false);
  expect(isIncorrectPinStatusWord([0x63, 0xd0])).toEqual(false);
});

test.each<{ sw2: Byte; expectedNumRemainingAttempts: number }>([
  { sw2: 0xc0, expectedNumRemainingAttempts: 0 },
  { sw2: 0xc1, expectedNumRemainingAttempts: 1 },
  { sw2: 0xc2, expectedNumRemainingAttempts: 2 },
  { sw2: 0xc3, expectedNumRemainingAttempts: 3 },
  { sw2: 0xc4, expectedNumRemainingAttempts: 4 },
  { sw2: 0xc5, expectedNumRemainingAttempts: 5 },
  { sw2: 0xc6, expectedNumRemainingAttempts: 6 },
  { sw2: 0xc7, expectedNumRemainingAttempts: 7 },
  { sw2: 0xc8, expectedNumRemainingAttempts: 8 },
  { sw2: 0xc9, expectedNumRemainingAttempts: 9 },
  { sw2: 0xca, expectedNumRemainingAttempts: 10 },
  { sw2: 0xcb, expectedNumRemainingAttempts: 11 },
  { sw2: 0xcc, expectedNumRemainingAttempts: 12 },
  { sw2: 0xcd, expectedNumRemainingAttempts: 13 },
  { sw2: 0xce, expectedNumRemainingAttempts: 14 },
  { sw2: 0xcf, expectedNumRemainingAttempts: 15 },
])(
  'numRemainingAttemptsFromIncorrectPinStatusWord',
  ({ sw2, expectedNumRemainingAttempts }) => {
    expect(numRemainingAttemptsFromIncorrectPinStatusWord([0x63, sw2])).toEqual(
      expectedNumRemainingAttempts
    );
  }
);

test('numRemainingAttemptsFromIncorrectPinStatusWord validation', () => {
  expect(() =>
    numRemainingAttemptsFromIncorrectPinStatusWord([0x90, 0x00])
  ).toThrow();
});
