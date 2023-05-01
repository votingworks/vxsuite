import { assert } from '@votingworks/basics';

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
  { numIncorrectPinAttempts: 6, expectedCardLockoutDurationSeconds: 30 },
  { numIncorrectPinAttempts: 7, expectedCardLockoutDurationSeconds: 60 },
  { numIncorrectPinAttempts: 8, expectedCardLockoutDurationSeconds: 120 },
  { numIncorrectPinAttempts: 9, expectedCardLockoutDurationSeconds: 240 },
  { numIncorrectPinAttempts: 10, expectedCardLockoutDurationSeconds: 480 },
  { numIncorrectPinAttempts: 11, expectedCardLockoutDurationSeconds: 960 },
  { numIncorrectPinAttempts: 12, expectedCardLockoutDurationSeconds: 1920 },
  { numIncorrectPinAttempts: 13, expectedCardLockoutDurationSeconds: 3840 },
  { numIncorrectPinAttempts: 14, expectedCardLockoutDurationSeconds: 7680 },
  { numIncorrectPinAttempts: 15, expectedCardLockoutDurationSeconds: 15360 },
])(
  'computeCardLockoutEndTime with default config params',
  ({ numIncorrectPinAttempts, expectedCardLockoutDurationSeconds }) => {
    const startTime = new Date();
    const endTime = computeCardLockoutEndTime(
      {},
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
  { numIncorrectPinAttempts: 4, expectedCardLockoutDurationSeconds: 120 },
  { numIncorrectPinAttempts: 5, expectedCardLockoutDurationSeconds: 240 },
  { numIncorrectPinAttempts: 6, expectedCardLockoutDurationSeconds: 480 },
  { numIncorrectPinAttempts: 7, expectedCardLockoutDurationSeconds: 960 },
  { numIncorrectPinAttempts: 8, expectedCardLockoutDurationSeconds: 1920 },
  { numIncorrectPinAttempts: 9, expectedCardLockoutDurationSeconds: 3840 },
  { numIncorrectPinAttempts: 10, expectedCardLockoutDurationSeconds: 7680 },
  { numIncorrectPinAttempts: 11, expectedCardLockoutDurationSeconds: 15360 },
  { numIncorrectPinAttempts: 12, expectedCardLockoutDurationSeconds: 30720 },
  { numIncorrectPinAttempts: 13, expectedCardLockoutDurationSeconds: 61440 },
  { numIncorrectPinAttempts: 14, expectedCardLockoutDurationSeconds: 122880 },
  { numIncorrectPinAttempts: 15, expectedCardLockoutDurationSeconds: 245760 },
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
