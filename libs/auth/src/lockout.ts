import { DateTime } from 'luxon';
import { Optional } from '@votingworks/basics';
import {
  NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  StartingCardLockoutDurationSeconds,
} from '@votingworks/types';

/**
 * Config params for card lockout
 */
export interface CardLockoutConfig {
  numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}

/**
 * Returns the time at which a card lockout will end, or undefined if a card isn't locked, given a
 * config, the number of incorrect PIN attempts, and a start time (defaults to the current time).
 *
 * Providing an example of the lockout duration calculation, if the number of incorrect PIN
 * attempts allowed before lockout is 5, and the starting lockout duration is 15 seconds, the
 * lockout durations before each attempt will be as follows:
 * - No lockout before attempt 1
 * - No lockout before attempt 2
 * - No lockout before attempt 3
 * - No lockout before attempt 4
 * - No lockout before attempt 5
 * - 15-second lockout before attempt 6
 * - 30-second lockout before attempt 7
 * - 60-second lockout before attempt 8
 * - ...
 * - 7680-second lockout before attempt 15
 */
export function computeCardLockoutEndTime(
  cardLockoutConfig: CardLockoutConfig,
  numIncorrectPinAttempts = 0,
  cardLockoutStartTime = new Date()
): Optional<Date> {
  const {
    numIncorrectPinAttemptsAllowedBeforeCardLockout,
    startingCardLockoutDurationSeconds,
  } = cardLockoutConfig;

  const numRemainingPinAttemptsWithoutCardLockout = Math.max(
    numIncorrectPinAttemptsAllowedBeforeCardLockout - numIncorrectPinAttempts,
    0
  );
  if (numRemainingPinAttemptsWithoutCardLockout > 0) {
    return undefined;
  }

  const numIncorrectPinAttemptsPostCardLockout =
    numIncorrectPinAttempts - numIncorrectPinAttemptsAllowedBeforeCardLockout;
  const cardLockoutDurationSeconds =
    startingCardLockoutDurationSeconds *
    2 ** numIncorrectPinAttemptsPostCardLockout;

  const cardLockoutEndTime = DateTime.fromJSDate(cardLockoutStartTime)
    .plus({ seconds: cardLockoutDurationSeconds })
    .toJSDate();
  return cardLockoutEndTime;
}
