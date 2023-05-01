import { z } from 'zod';

import {
  DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
  DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  InactiveSessionTimeLimitMinutes,
  InactiveSessionTimeLimitMinutesSchema,
  NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
  OverallSessionTimeLimitHours,
  OverallSessionTimeLimitHoursSchema,
  StartingCardLockoutDurationSeconds,
  StartingCardLockoutDurationSecondsSchema,
} from './auth';
import { Id, Iso8601Timestamp } from './generic';

/**
 * System settings as used by frontends and APIs. Several database fields are hidden from the app
 * because they are omitted in this model; see schema.sql.
 */
export interface SystemSettings {
  arePollWorkerCardPinsEnabled: boolean;
  inactiveSessionTimeLimitMinutes: InactiveSessionTimeLimitMinutes;
  numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  overallSessionTimeLimitHours: OverallSessionTimeLimitHours;
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}

export const SystemSettingsSchema: z.ZodType<SystemSettings> = z.object({
  arePollWorkerCardPinsEnabled: z.boolean(),
  inactiveSessionTimeLimitMinutes: InactiveSessionTimeLimitMinutesSchema,
  numIncorrectPinAttemptsAllowedBeforeCardLockout:
    NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
  overallSessionTimeLimitHours: OverallSessionTimeLimitHoursSchema,
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSecondsSchema,
});

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  arePollWorkerCardPinsEnabled: false,
  inactiveSessionTimeLimitMinutes: DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
  numIncorrectPinAttemptsAllowedBeforeCardLockout:
    DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  overallSessionTimeLimitHours: DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  startingCardLockoutDurationSeconds:
    DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
};

/**
 * System settings as used by the db.
 */
export interface SystemSettingsDbRow {
  id: Id;
  created: Iso8601Timestamp;
  arePollWorkerCardPinsEnabled: 0 | 1; // sqlite3 does not support booleans
  inactiveSessionTimeLimitMinutes: InactiveSessionTimeLimitMinutes;
  numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  overallSessionTimeLimitHours: OverallSessionTimeLimitHours;
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}
