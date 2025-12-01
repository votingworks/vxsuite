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
   * Sets the threshold for the maximum cumulative width of vertical streaks
   * when scanning. Ballots with streaks whose width sum to more than this value
   * will be rejected with a cleaning warning. If unspecified, a default value
   * will be used.
   *
   * Note that regardless of what this value is set to, streaks that go through
   * timing marks or bubbles will still cause a ballot to be rejected. To disable all
   * vertical streak detection, use {@link SystemSettings.disableVerticalStreakDetection}.
   */
  readonly maxCumulativeVerticalStreakWidth?: number;

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
   * Disables the VxScan alarms triggered when USB drives are removed or the scanner cover is
   * opened while polls are open. These alarms can be silenced by inserting a smart card, but
   * forgetting to do so before performing a routine action like scanner cleaning could cause
   * unnecessary worry in a polling place. We're accordingly giving election officials the option
   * to disable these alarms completely.
   */
  readonly precinctScanDisableAlarms?: boolean;

  /**
   * We detect the print scale of ballots and reject those with a detected scale less than
   * {@link DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE} to prevent issues with bubble scoring on ballots
   * that are printed at too low of a scale. This setting allows overriding that default value. The
   * check can be essentially disabled by setting this value to 0.
   */
  readonly minimumDetectedBallotScaleOverride?: number;

  /**
   * The BMD print mode for the election.
   * See {@link BmdPrintMode}.
   */
  readonly bmdPrintMode?: BmdPrintMode;

  /**
   * Disables the blocking system limit checks performed on election package import and allows
   * usage of election packages that exceed system limits.
   */
  readonly disableSystemLimitChecks?: boolean;

  /**
   * Disables the help buttons on voter-facing screens. We are required to include these buttons
   * for cert but also believe that they are superfluous and clutter the screen.
   */
  readonly disableVoterHelpButtons?: boolean;
}

const PRINT_MODES = [
  'bubble_ballot',
  'marks_on_preprinted_ballot',
  'summary',
] as const;

/**
 * - `bubble_ballot`: Full HMPBs, printed on blank sheets, with votes marked.
 * - `marks_on_preprinted_ballot`: Bubble marks only, on preprinted HMPB sheets.
 * - `summary`: Summary ballot, printed on blank sheets, with QR-encoded votes.
 */
export type BmdPrintMode = (typeof PRINT_MODES)[number];

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
  minimumDetectedBallotScaleOverride: z.number().min(0.0).max(1.0).optional(),
  bmdPrintMode: z.enum(PRINT_MODES).optional(),
  precinctScanDisableAlarms: z.boolean().optional(),
  disableSystemLimitChecks: z.boolean().optional(),
  disableVoterHelpButtons: z.boolean().optional(),
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
 * See {@link SystemSettings.minimumDetectedBallotScaleOverride} for more context. Landed on this
 * as a good default through empirical testing.
 */
export const DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE = 0.985;

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
