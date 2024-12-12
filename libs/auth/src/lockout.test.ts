import { expect, test } from 'vitest';
import { assert } from '@votingworks/basics';
import {
  DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
} from '@votingworks/types';

import { CardLockoutConfig, computeCardLockoutEndTime } from './lockout';

test.each<{
  numIncorrectPinAttempts: number;
  expectedCardLockoutDurationSeconds?: number;
}>([
  { numIncorrectPinAttempts: 0, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 1, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 2, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 3, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 4, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 5, expectedCardLockoutDurationSeconds: 15 },
  { numIncorrectPinAttempts: 6, expectedCardLockoutDurationSeconds: 15 * 2 },
  { numIncorrectPinAttempts: 7, expectedCardLockoutDurationSeconds: 15 * 4 },
  { numIncorrectPinAttempts: 8, expectedCardLockoutDurationSeconds: 15 * 8 },
  { numIncorrectPinAttempts: 9, expectedCardLockoutDurationSeconds: 15 * 16 },
  { numIncorrectPinAttempts: 10, expectedCardLockoutDurationSeconds: 15 * 32 },
  { numIncorrectPinAttempts: 11, expectedCardLockoutDurationSeconds: 15 * 64 },
  { numIncorrectPinAttempts: 12, expectedCardLockoutDurationSeconds: 15 * 128 },
  { numIncorrectPinAttempts: 13, expectedCardLockoutDurationSeconds: 15 * 256 },
  { numIncorrectPinAttempts: 14, expectedCardLockoutDurationSeconds: 15 * 512 },
  {
    numIncorrectPinAttempts: 15,
    expectedCardLockoutDurationSeconds: 15 * 1024,
  },
])(
  'computeCardLockoutEndTime with default config params',
  ({ numIncorrectPinAttempts, expectedCardLockoutDurationSeconds }) => {
    const startTime = new Date();
    const endTime = computeCardLockoutEndTime(
      {
        numIncorrectPinAttemptsAllowedBeforeCardLockout:
          DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
        startingCardLockoutDurationSeconds:
          DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
      },
      numIncorrectPinAttempts,
      startTime
    );
    if (expectedCardLockoutDurationSeconds === undefined) {
      expect(endTime).toEqual(undefined);
    } else {
      assert(endTime !== undefined);
      expect((endTime.getTime() - startTime.getTime()) / 1000).toEqual(
        expectedCardLockoutDurationSeconds
      );
    }
  }
);

test.each<{
  numIncorrectPinAttempts: number;
  expectedCardLockoutDurationSeconds?: number;
}>([
  { numIncorrectPinAttempts: 0, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 1, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 2, expectedCardLockoutDurationSeconds: undefined },
  { numIncorrectPinAttempts: 3, expectedCardLockoutDurationSeconds: 60 },
  { numIncorrectPinAttempts: 4, expectedCardLockoutDurationSeconds: 60 * 2 },
  { numIncorrectPinAttempts: 5, expectedCardLockoutDurationSeconds: 60 * 4 },
  { numIncorrectPinAttempts: 6, expectedCardLockoutDurationSeconds: 60 * 8 },
  { numIncorrectPinAttempts: 7, expectedCardLockoutDurationSeconds: 60 * 16 },
  { numIncorrectPinAttempts: 8, expectedCardLockoutDurationSeconds: 60 * 32 },
  { numIncorrectPinAttempts: 9, expectedCardLockoutDurationSeconds: 60 * 64 },
  { numIncorrectPinAttempts: 10, expectedCardLockoutDurationSeconds: 60 * 128 },
  { numIncorrectPinAttempts: 11, expectedCardLockoutDurationSeconds: 60 * 256 },
  { numIncorrectPinAttempts: 12, expectedCardLockoutDurationSeconds: 60 * 512 },
  {
    numIncorrectPinAttempts: 13,
    expectedCardLockoutDurationSeconds: 60 * 1024,
  },
  {
    numIncorrectPinAttempts: 14,
    expectedCardLockoutDurationSeconds: 60 * 2048,
  },
  {
    numIncorrectPinAttempts: 15,
    expectedCardLockoutDurationSeconds: 60 * 4096,
  },
])(
  'computeCardLockoutEndTime with custom config',
  ({ numIncorrectPinAttempts, expectedCardLockoutDurationSeconds }) => {
    const customCardLockoutConfig: CardLockoutConfig = {
      numIncorrectPinAttemptsAllowedBeforeCardLockout: 3,
      startingCardLockoutDurationSeconds: 60,
    };
    const startTime = new Date();
    const endTime = computeCardLockoutEndTime(
      customCardLockoutConfig,
      numIncorrectPinAttempts,
      startTime
    );
    if (expectedCardLockoutDurationSeconds === undefined) {
      expect(endTime).toEqual(undefined);
    } else {
      assert(endTime !== undefined);
      expect((endTime.getTime() - startTime.getTime()) / 1000).toEqual(
        expectedCardLockoutDurationSeconds
      );
    }
  }
);
