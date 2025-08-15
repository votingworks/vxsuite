import { Result } from '@votingworks/basics';
import { z } from 'zod/v4';
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

export const BMD_PRINT_MODES = ['bubble_marks', 'summary'] as const;

/**
 * The type of BMD print output for a given election.
 * - `bubble_marks`: Filled bubbles printed over a pre-printed ballot.
 * - `summary`: A text-based vote summary along with QR code encoding the
 *   votes and additional ballot metadata.
 */
export type BmdPrintMode = (typeof BMD_PRINT_MODES)[number];

export const BmdPrintModeSchema: z.ZodSchema<BmdPrintMode> =
  z.enum(BMD_PRINT_MODES);

/**
 * Settings for various parts of the system that are not part of the election
 * definition. These settings can be changed without changing the ballot hash
 * (and therefore not needing to reprint ballots, for example).
 */
export interface SystemSettings {
  readonly allowOfficialBallotsInTestMode?: boolean;
  readonly auth: AuthSettings;
  readonly markThresholds: MarkThresholds;
  readonly bitonalThreshold?: number;
  readonly adminAdjudicationReasons: readonly AdjudicationReason[];
  readonly centralScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly disallowCastingOvervotes: boolean;
  readonly precinctScanEnableShoeshineMode?: boolean;

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

  /**
   * Enables quick results reporting and provides the server URL to post results to.
   */
  readonly quickResultsReportingUrl?: string;

  /**
   * Turns on the VxScan feature to read ballot IDs from HMPB QR codes, encrypt
   * them, and export them to CVRs (to be used for post-election auditing).
   */
  readonly precinctScanEnableBallotAuditIds?: boolean;

  /**
   * Enables BMD ballot scanning on VxScan. If unspecified, BMD ballots will be rejected on VxScan.
   */
  readonly precinctScanEnableBmdBallotScanning?: boolean;

  /**
   * Reject ballots with a detected scale less than this value. This can
   * prevent issues with bubble scoring on ballots that are printed at too low
   * of a scale. In practice, this value should be between 0.9 and 1.0.
   */
  readonly minimumDetectedScale?: number;

  /**
   * When enabled, voters may select select additional candidates beyond the
   * contest seat limit.
   */
  readonly bmdAllowOvervotes?: boolean;

  /**
   * NOTE: This is a WIP feature - this setting is currently set to `undefined`
   * to represent the default `summary` print mode.
   *
   * See {@link BmdPrintMode}.
   */
  readonly bmdPrintMode?: BmdPrintMode;
}

export const SystemSettingsSchema: z.ZodType<SystemSettings> = z.object({
  allowOfficialBallotsInTestMode: z.boolean().optional(),
  auth: AuthSettingsSchema,
  markThresholds: MarkThresholdsSchema,
  bitonalThreshold: z.number().min(0).max(100).optional(),
  adminAdjudicationReasons: z.array(z.lazy(() => AdjudicationReasonSchema)),
  centralScanAdjudicationReasons: z.array(
    z.lazy(() => AdjudicationReasonSchema)
  ),
  precinctScanAdjudicationReasons: z.array(
    z.lazy(() => AdjudicationReasonSchema)
  ),
  disallowCastingOvervotes: z.boolean(),
  precinctScanEnableShoeshineMode: z.boolean().optional(),
  castVoteRecordsIncludeRedundantMetadata: z.boolean().optional(),
  disableVerticalStreakDetection: z.boolean().optional(),
  quickResultsReportingUrl: z.string().optional(),
  precinctScanEnableBallotAuditIds: z.boolean().optional(),
  precinctScanEnableBmdBallotScanning: z.boolean().optional(),
  minimumDetectedScale: z.number().min(0.0).max(1.0).optional(),
  bmdAllowOvervotes: z.boolean().optional(),
  bmdPrintMode: BmdPrintModeSchema.optional(),
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

/**
 * The default bitonal threshold for scanning ballots.
 * See Section 2.1.43 of the PDI PageScan software specification.
 */
export const DEFAULT_BITONAL_THRESHOLD = 75;

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
  adminAdjudicationReasons: [],
  precinctScanEnableBmdBallotScanning: true,
};
