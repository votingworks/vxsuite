import { Result } from '@votingworks/basics';
import { z } from 'zod';
import { AdjudicationReason, AdjudicationReasonSchema } from './election';
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
import { safeParseJson } from './generic';

interface AuthSettings {
  readonly arePollWorkerCardPinsEnabled: boolean;
  readonly inactiveSessionTimeLimitMinutes: InactiveSessionTimeLimitMinutes;
  readonly numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  readonly overallSessionTimeLimitHours: OverallSessionTimeLimitHours;
  readonly startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}

const AuthSettingsSchema: z.ZodType<AuthSettings> = z.object({
  arePollWorkerCardPinsEnabled: z.boolean(),
  inactiveSessionTimeLimitMinutes: InactiveSessionTimeLimitMinutesSchema,
  numIncorrectPinAttemptsAllowedBeforeCardLockout:
    NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
  overallSessionTimeLimitHours: OverallSessionTimeLimitHoursSchema,
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSecondsSchema,
});

export interface MarkThresholds {
  readonly marginal: number;
  readonly definite: number;
  readonly writeInTextArea?: number;
}

export const MarkThresholdsSchema: z.ZodSchema<MarkThresholds> = z
  .object({
    marginal: z.number().min(0).max(1),
    definite: z.number().min(0).max(1),
    writeInTextArea: z.number().min(0).max(1).optional(),
  })
  .refine(
    ({ marginal, definite }) => marginal <= definite,
    'marginal mark threshold must be less than or equal to definite mark threshold'
  );

/**
 * Settings for various parts of the system that are not part of the election
 * definition. These settings can be changed without changing the ballot hash
 * (and therefore not needing to reprint ballots, for example).
 */
export interface SystemSettings {
  readonly allowOfficialBallotsInTestMode?: boolean;
  readonly auth: AuthSettings;
  readonly markThresholds: MarkThresholds;
  readonly centralScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly disallowCastingOvervotes: boolean;
  readonly precinctScanEnableShoeshineMode?: boolean;
  /**
   * Includes original snapshots in cast vote record reports, increasing export size and
   * import/export time (required for CDF).
   */
  readonly castVoteRecordsIncludeOriginalSnapshots?: boolean;
  /**
   * Includes redundant metadata in cast vote record reports, increasing export size and
   * import/export time (required for CDF).
   */
  readonly castVoteRecordsIncludeRedundantMetadata?: boolean;
  /**
   * Disables vertical streak detection when scanning. This should only be used
   * as a workaround in case the ballots have a design that triggers false
   * positives.
   */
  readonly disableVerticalStreakDetection?: boolean;
}

export const SystemSettingsSchema: z.ZodType<SystemSettings> = z.object({
  allowOfficialBallotsInTestMode: z.boolean().optional(),
  auth: AuthSettingsSchema,
  markThresholds: MarkThresholdsSchema,
  centralScanAdjudicationReasons: z.array(
    z.lazy(() => AdjudicationReasonSchema)
  ),
  precinctScanAdjudicationReasons: z.array(
    z.lazy(() => AdjudicationReasonSchema)
  ),
  disallowCastingOvervotes: z.boolean(),
  precinctScanEnableShoeshineMode: z.boolean().optional(),
  castVoteRecordsIncludeOriginalSnapshots: z.boolean().optional(),
  castVoteRecordsIncludeRedundantMetadata: z.boolean().optional(),
  disableVerticalStreakDetection: z.boolean().optional(),
});

/**
 * Parses `value` as JSON `SystemSettings` or returns an error if input is malformed
 */
export function safeParseSystemSettings(
  value: string
): Result<SystemSettings, z.ZodError | SyntaxError> {
  return safeParseJson(value, SystemSettingsSchema);
}

export const DEFAULT_MARK_THRESHOLDS: Readonly<MarkThresholds> = {
  marginal: 0.05,
  definite: 0.07,
  writeInTextArea: 0.05,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  auth: {
    arePollWorkerCardPinsEnabled: false,
    inactiveSessionTimeLimitMinutes:
      DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
    numIncorrectPinAttemptsAllowedBeforeCardLockout:
      DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
    overallSessionTimeLimitHours: DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
    startingCardLockoutDurationSeconds:
      DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  },
  markThresholds: DEFAULT_MARK_THRESHOLDS,
  precinctScanAdjudicationReasons: [],
  disallowCastingOvervotes: false,
  centralScanAdjudicationReasons: [],
};
