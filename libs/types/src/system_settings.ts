import { Result } from '@votingworks/basics';
import { z } from 'zod/v4';
import { AdjudicationReasonSchema } from './election';
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

/**
 * Default cumulative width threshold for vertical streak detection in pixels.
 * See {@link SystemSettings.maxCumulativeStreakWidth}.
 *
 * NOTE: This value must match DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH in
 * libs/ballot-interpreter/src/bubble-ballot-rust/interpret.rs
 */
export const DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH = 5;

/**
 * Default retry threshold for vertical streak detection in pixels when timing marks fail.
 * See {@link SystemSettings.retryStreakWidthThreshold}.
 *
 * NOTE: This value must match DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD in
 * libs/ballot-interpreter/src/bubble-ballot-rust/interpret.rs
 */
export const DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD = 1;

export const SystemSettingsSchema = z
  .object({
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

    /**
     * Includes redundant metadata in cast vote record reports, increasing export size and
     * import/export time (required for CDF).
     */
    castVoteRecordsIncludeRedundantMetadata: z.boolean().optional(),

    /**
     * Disables vertical streak detection when scanning. This should only be used
     * as a workaround in case the ballots have a design that triggers false
     * positives.
     */
    disableVerticalStreakDetection: z.boolean().optional(),

    /**
     * The cumulative width threshold in pixels for vertical streak detection.
     * If the total width of detected streaks exceeds this threshold, the ballot
     * will be rejected with a "scanner needs cleaning" error. Default is 5 pixels.
     */
    maxCumulativeStreakWidth: z.number().int().min(1).optional(),

    /**
     * When timing marks cannot be found on a ballot, retry streak detection with
     * this lower threshold. If streaks are detected at this threshold, the ballot
     * will be rejected as "scanner needs cleaning" rather than "unreadable".
     * This helps differentiate between truly unreadable ballots and ballots that
     * are unreadable due to minor streaks. Must be less than maxCumulativeStreakWidth
     * (retrying with the same threshold would be pointless since detection is deterministic).
     * Default is 1 pixel.
     */
    retryStreakWidthThreshold: z.number().int().min(1).optional(),

    /**
     * Enables quick results reporting and provides the server URL to post results to.
     */
    quickResultsReportingUrl: z.string().optional(),

    /**
     * Turns on the VxScan feature to read ballot IDs from HMPB QR codes, encrypt
     * them, and export them to CVRs (to be used for post-election auditing).
     */
    precinctScanEnableBallotAuditIds: z.boolean().optional(),

    /**
     * Enables BMD ballot scanning on VxScan. If unspecified, BMD ballots will be rejected on VxScan.
     */
    precinctScanEnableBmdBallotScanning: z.boolean().optional(),

    /**
     * We detect the print scale of ballots and reject those with a detected scale less than
     * {@link DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE} to prevent issues with bubble scoring on ballots
     * that are printed at too low of a scale. This setting allows overriding that default value. The
     * check can be essentially disabled by setting this value to 0.
     */
    minimumDetectedBallotScaleOverride: z.number().min(0.0).max(1.0).optional(),

    /**
     * The BMD print mode for the election.
     * See {@link BmdPrintMode}.
     */
    bmdPrintMode: z.enum(PRINT_MODES).optional(),

    /**
     * Disables the VxScan alarms triggered when USB drives are removed or the scanner cover is
     * opened while polls are open. These alarms can be silenced by inserting a smart card, but
     * forgetting to do so before performing a routine action like scanner cleaning could cause
     * unnecessary worry in a polling place. We're accordingly giving election officials the option
     * to disable these alarms completely.
     */
    precinctScanDisableAlarms: z.boolean().optional(),

    /**
     * Disables the blocking system limit checks performed on election package import and allows
     * usage of election packages that exceed system limits.
     */
    disableSystemLimitChecks: z.boolean().optional(),

    /**
     * Disables the help buttons on voter-facing screens. We are required to include these buttons
     * for cert but also believe that they are superfluous and clutter the screen.
     */
    disableVoterHelpButtons: z.boolean().optional(),

    /**
     * Enables QR barcode scanning to activate ballot styles on VxMark. When enabled,
     * scanning a QR code will automatically start a voter session with the first
     * available ballot style for the configured precinct.
     */
    bmdEnableQrBallotActivation: z.boolean().optional(),
  })
  .refine(
    (settings) => {
      // Validate that retry streak threshold is strictly less than max cumulative streak width
      // since retrying with the same threshold would be pointless (deterministic check)
      const maxWidth = settings.maxCumulativeStreakWidth ?? DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH;
      const retryThreshold = settings.retryStreakWidthThreshold ?? DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD;
      return retryThreshold < maxWidth;
    },
    {
      message:
        'retryStreakWidthThreshold must be less than maxCumulativeStreakWidth',
    }
  )
  .readonly();

/**
 * Settings for various parts of the system that are not part of the election
 * definition. These settings can be changed without changing the ballot hash
 * (and therefore not needing to reprint ballots, for example).
 */
export interface SystemSettings extends z.infer<typeof SystemSettingsSchema> { }
// To enforce that this type matches its schema exactly, we infer the type from
// the schema rather than defining them in parallel. We use this approach for
// top-level schemas for input to the certified system to ensure that the data
// exported from VxDesign exactly matches what the machines parse as input.

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
