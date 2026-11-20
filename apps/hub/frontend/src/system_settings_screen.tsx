import React, { useRef, useState } from 'react';
import {
  H1,
  H2,
  Button,
  Card,
  CheckboxGroup,
  MainContent,
  CheckboxButton,
  SearchSelect,
  Modal,
  P,
} from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import {
  AdjudicationReason,
  AdjudicationReasonSchema,
  type BallotImageBitDepth,
  type BmdPrintMode,
  DEFAULT_BALLOT_IMAGE_BIT_DEPTH,
  DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
  DEFAULT_MARK_THRESHOLDS,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
  DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  type ElectionId,
  type InactiveSessionTimeLimitMinutes,
  InactiveSessionTimeLimitMinutesSchema,
  type NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
  type OverallSessionTimeLimitHours,
  OverallSessionTimeLimitHoursSchema,
  safeParse,
  safeParseInt,
  type StartingCardLockoutDurationSeconds,
  StartingCardLockoutDurationSecondsSchema,
  type SystemSettings,
  SystemSettingsSchema,
  unsafeParse,
} from '@votingworks/types';
import { z } from 'zod/v4';
import { Row, InputGroup, Column } from '@votingworks/election-definition-ui';
import { Form, FormActionsRow } from './layout.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { type ElectionIdParams, routes } from './routes.js';
import {
  updateSystemSettings,
  getUserFeatures,
  getSystemSettings,
  getResultsReportingUrl,
} from './api.js';
import { useTitle } from './hooks/use_title.js';

function safeParseFormValue<T>(
  schema: z.ZodSchema<T>,
  defaultValue: T,
  value?: string | number
): T {
  let intValue = value;
  if (typeof value === 'string') {
    const parseResult = safeParseInt(value);
    // @coverage-defer
    if (parseResult.isErr()) {
      return defaultValue;
    }
    intValue = parseResult.ok();
  }

  const result = safeParse(schema, intValue);
  if (result.isOk()) {
    return result.ok();
  }
  return defaultValue;
}

function safeParseInactiveSessionTimeLimit(
  value?: string
): InactiveSessionTimeLimitMinutes {
  return safeParseFormValue(
    InactiveSessionTimeLimitMinutesSchema,
    DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
    value
  );
}

function safeParseIncorrectPinAttempts(
  value?: string
): NumIncorrectPinAttemptsAllowedBeforeCardLockout {
  return safeParseFormValue(
    NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
    DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
    value
  );
}

function safeParseOverallSessionTimeLimit(
  value?: number
): OverallSessionTimeLimitHours {
  return safeParseFormValue(
    OverallSessionTimeLimitHoursSchema,
    DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
    value
  );
}

function safeParseStartingCardLockoutDurationSeconds(
  value?: string
): StartingCardLockoutDurationSeconds {
  return safeParseFormValue(
    StartingCardLockoutDurationSecondsSchema,
    DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
    value
  );
}

type BooleanSystemSetting = {
  [K in keyof SystemSettings]-?: NonNullable<SystemSettings[K]> extends boolean
    ? K
    : never;
}[keyof SystemSettings];

interface SystemSettingsCheckboxProps {
  label: string;
  setting: BooleanSystemSetting;
  /**
   * Remove the setting from the saved settings when unchecked, instead of
   * saving `false`.
   */
  omitWhenUnchecked?: boolean;
  systemSettings: SystemSettings;
  setSystemSettings: (systemSettings: SystemSettings) => void;
  disabled: boolean;
}

function SystemSettingsCheckbox({
  label,
  setting,
  omitWhenUnchecked = false,
  systemSettings,
  setSystemSettings,
  disabled,
}: SystemSettingsCheckboxProps): JSX.Element {
  return (
    <CheckboxButton
      label={label}
      isChecked={Boolean(systemSettings[setting])}
      onChange={(isChecked) =>
        setSystemSettings({
          ...systemSettings,
          [setting]: !isChecked && omitWhenUnchecked ? undefined : isChecked,
        })
      }
      disabled={disabled}
    />
  );
}

export function SystemSettingsForm({
  electionId,
  savedSystemSettings,
}: {
  electionId: ElectionId;
  savedSystemSettings: SystemSettings;
}): JSX.Element | null {
  const [isEditing, setIsEditing] = useState(false);
  const [systemSettings, setSystemSettings] =
    useState<SystemSettings>(savedSystemSettings);
  const [
    isConfirmingMorningPollsCloseTime,
    setIsConfirmingMorningPollsCloseTime,
  ] = useState(false);
  const updateSystemSettingsMutation = updateSystemSettings.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getResultsReportingUrlQuery = getResultsReportingUrl.useQuery();

  const maxCumulativeStreakWidthInputRef = useRef<HTMLInputElement>(null);
  const retryStreakWidthThresholdInputRef = useRef<HTMLInputElement>(null);

  function validateStreakSettings(settings: SystemSettings) {
    const parseResult = safeParse(SystemSettingsSchema, settings);

    maxCumulativeStreakWidthInputRef.current?.setCustomValidity('');
    retryStreakWidthThresholdInputRef.current?.setCustomValidity('');

    if (parseResult.isErr()) {
      const maxWidthError = parseResult
        .err()
        .issues.find((err) =>
          err.path.includes(
            'maxCumulativeStreakWidth' satisfies keyof SystemSettings
          )
        );
      const retryThresholdError = parseResult
        .err()
        .issues.find((err) =>
          err.path.includes(
            'retryStreakWidthThreshold' satisfies keyof SystemSettings
          )
        );

      // @coverage-defer
      if (maxWidthError) {
        maxCumulativeStreakWidthInputRef.current?.setCustomValidity(
          maxWidthError.message
        );
      }

      // @coverage-defer
      if (retryThresholdError) {
        retryStreakWidthThresholdInputRef.current?.setCustomValidity(
          retryThresholdError.message
        );
      }
    }
  }

  if (
    !getUserFeaturesQuery.isSuccess ||
    !getResultsReportingUrlQuery.isSuccess
  ) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  function saveSettings() {
    updateSystemSettingsMutation.mutate(
      { electionId, systemSettings },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  function onSubmit() {
    const { electionDayPollsCloseTime } = systemSettings;
    if (electionDayPollsCloseTime) {
      const hour =
        // @coverage-defer
        safeParseInt(electionDayPollsCloseTime.split(':')[0]).ok() ?? 0;
      if (hour < 12) {
        setIsConfirmingMorningPollsCloseTime(true);
        return;
      }
    }
    saveSettings();
  }

  const adjudicationReasonOptions: Array<{
    label: string;
    value: AdjudicationReason;
  }> = [
    { label: 'Overvote', value: AdjudicationReason.Overvote },
    { label: 'Undervote', value: AdjudicationReason.Undervote },
    { label: 'Marginal Mark', value: AdjudicationReason.MarginalMark },
    { label: 'Blank Ballot', value: AdjudicationReason.BlankBallot },
    { label: 'Unmarked Write-In', value: AdjudicationReason.UnmarkedWriteIn },
  ];

  const adminAdjudicationReasonOptions = adjudicationReasonOptions.filter(
    // UnmarkedWriteIn is excluded from adminAdjudicationReasons because
    // admin will surface all unmarked write-ins that the scanner tags.
    // It is effectively equal to the scanner's adjudication setting.
    (option) => option.value !== AdjudicationReason.UnmarkedWriteIn
  );

  const isScoringUnmarkedWriteIns =
    systemSettings.centralScanAdjudicationReasons?.includes(
      AdjudicationReason.UnmarkedWriteIn
    ) ||
    systemSettings.precinctScanAdjudicationReasons?.includes(
      AdjudicationReason.UnmarkedWriteIn
    );

  const checkboxProps = {
    systemSettings,
    setSystemSettings,
    disabled: !isEditing,
  } as const;

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setSystemSettings(savedSystemSettings);
        setIsEditing(false);
      }}
    >
      <Row style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <Card>
          <H2>Adjudication Reasons</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxGroup
              label="VxScan"
              options={adjudicationReasonOptions}
              // @coverage-defer
              value={systemSettings.precinctScanAdjudicationReasons ?? []}
              onChange={(value) =>
                setSystemSettings({
                  ...systemSettings,
                  precinctScanAdjudicationReasons: unsafeParse(
                    z.array(AdjudicationReasonSchema),
                    value
                  ),
                })
              }
              disabled={!isEditing}
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Disallow Casting Overvotes"
              setting="disallowCastingOvervotes"
            />
            <CheckboxGroup
              label="VxCentralScan"
              options={adjudicationReasonOptions}
              // @coverage-defer
              value={systemSettings.centralScanAdjudicationReasons ?? []}
              onChange={(value) =>
                setSystemSettings({
                  ...systemSettings,
                  centralScanAdjudicationReasons: unsafeParse(
                    z.array(AdjudicationReasonSchema),
                    value
                  ),
                })
              }
              disabled={!isEditing}
            />
            <CheckboxGroup
              label="VxAdmin"
              options={adminAdjudicationReasonOptions}
              // @coverage-defer
              value={systemSettings.adminAdjudicationReasons ?? []}
              onChange={(value) =>
                setSystemSettings({
                  ...systemSettings,
                  adminAdjudicationReasons: unsafeParse(
                    z.array(AdjudicationReasonSchema),
                    value
                  ),
                })
              }
              disabled={!isEditing}
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Limit Adjudication to Flagged Contests"
              setting="limitAdminAdjudicationToFlaggedContests"
              omitWhenUnchecked
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Count VxCentralScan Ballots Only After Adjudication"
              setting="countCentralScanBallotsOnlyAfterAdjudication"
              omitWhenUnchecked
            />
          </Column>
        </Card>
        <Card style={{ minWidth: '16rem' }}>
          <H2>Scanner Thresholds</H2>
          <Column style={{ gap: '1.5rem' }}>
            <InputGroup label="Definite Mark Threshold">
              <input
                type="number"
                // @coverage-defer
                value={systemSettings.markThresholds?.definite ?? ''}
                onChange={(e) => {
                  const definite = e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    markThresholds: {
                      // @coverage-defer
                      ...(systemSettings.markThresholds ||
                        DEFAULT_MARK_THRESHOLDS),
                      // @coverage-defer
                      definite: Number.isNaN(definite)
                        ? DEFAULT_MARK_THRESHOLDS.definite
                        : definite,
                    },
                  });
                }}
                step={0.005}
                min={0}
                max={1}
                disabled={!isEditing}
                required
              />
            </InputGroup>
            <InputGroup label="Marginal Mark Threshold">
              <input
                type="number"
                value={systemSettings.markThresholds.marginal}
                onChange={(e) => {
                  const marginal = e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    markThresholds: {
                      // @coverage-defer
                      ...(systemSettings.markThresholds ||
                        DEFAULT_MARK_THRESHOLDS),
                      // @coverage-defer
                      marginal: Number.isNaN(marginal)
                        ? DEFAULT_MARK_THRESHOLDS.marginal
                        : marginal,
                    },
                  });
                }}
                step={0.005}
                min={0}
                max={1}
                disabled={!isEditing}
                required
              />
            </InputGroup>
            {isScoringUnmarkedWriteIns && (
              <InputGroup label="Write-In Ink Area Threshold (mm²)">
                <input
                  type="number"
                  value={systemSettings.markThresholds.writeInInkAreaMm2}
                  onChange={(e) => {
                    const writeInInkAreaMm2 = e.target.valueAsNumber;
                    setSystemSettings({
                      ...systemSettings,
                      markThresholds: {
                        // @coverage-defer
                        ...(systemSettings.markThresholds ||
                          DEFAULT_MARK_THRESHOLDS),
                        // @coverage-defer
                        writeInInkAreaMm2: Number.isNaN(writeInInkAreaMm2)
                          ? DEFAULT_MARK_THRESHOLDS.writeInInkAreaMm2
                          : writeInInkAreaMm2,
                      },
                    });
                  }}
                  step={0.5}
                  min={0}
                  disabled={!isEditing}
                  required
                />
              </InputGroup>
            )}
            <InputGroup label="Minimum Detected Ballot Scale Override">
              <input
                type="number"
                value={systemSettings.minimumDetectedBallotScaleOverride ?? ''}
                onChange={(e) => {
                  const minimumDetectedBallotScaleOverride =
                    e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    minimumDetectedBallotScaleOverride: Number.isNaN(
                      minimumDetectedBallotScaleOverride
                    )
                      ? undefined
                      : minimumDetectedBallotScaleOverride,
                  });
                }}
                onBlur={(e) => {
                  // @coverage-defer
                  if (e.target.value === '') {
                    setSystemSettings({
                      ...systemSettings,
                      minimumDetectedBallotScaleOverride: undefined,
                    });
                  }
                }}
                step={0.005}
                min={0}
                max={1}
                disabled={!isEditing}
              />
            </InputGroup>
            {!systemSettings.disableVerticalStreakDetection && (
              <React.Fragment>
                <InputGroup label="Max Cumulative Streak Width (Pixels)">
                  <input
                    ref={maxCumulativeStreakWidthInputRef}
                    type="number"
                    value={systemSettings.maxCumulativeStreakWidth}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      const newSettings: SystemSettings = {
                        ...systemSettings,
                        // @coverage-defer
                        maxCumulativeStreakWidth: Number.isNaN(value)
                          ? DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH
                          : value,
                      };
                      setSystemSettings(newSettings);
                      validateStreakSettings(newSettings);
                    }}
                    min={1}
                    step={1}
                    disabled={!isEditing}
                  />
                </InputGroup>
                <InputGroup label="Retry Streak Width Threshold (Pixels)">
                  <input
                    ref={retryStreakWidthThresholdInputRef}
                    type="number"
                    value={systemSettings.retryStreakWidthThreshold}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      const newSettings: SystemSettings = {
                        ...systemSettings,
                        retryStreakWidthThreshold: Number.isNaN(value)
                          ? DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD
                          : value,
                      };
                      setSystemSettings(newSettings);
                      validateStreakSettings(newSettings);
                    }}
                    min={1}
                    step={1}
                    disabled={!isEditing}
                  />
                </InputGroup>
              </React.Fragment>
            )}
            <InputGroup label="Ballot Image Bit Depth">
              <SearchSelect<BallotImageBitDepth>
                aria-label="Ballot Image Bit Depth"
                disabled={!isEditing}
                isMulti={false}
                isSearchable={false}
                onChange={(newValue) => {
                  setSystemSettings({
                    ...systemSettings,
                    ballotImageBitDepth: newValue,
                  });
                }}
                options={[
                  { label: '1-bit (Black and White)', value: 1 },
                  { label: '2-bit (Black, White, and Two Grays)', value: 2 },
                  { label: '8-bit (Full Grayscale)', value: 8 },
                ]}
                style={{ width: '100%' }}
                value={
                  systemSettings.ballotImageBitDepth ??
                  DEFAULT_BALLOT_IMAGE_BIT_DEPTH
                }
              />
            </InputGroup>
          </Column>
        </Card>
        <Card>
          <H2>Authentication</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxButton
              label="Enable Poll Worker PINs"
              isChecked={Boolean(
                systemSettings.auth.arePollWorkerCardPinsEnabled
              )}
              onChange={(isChecked) =>
                setSystemSettings({
                  ...systemSettings,
                  auth: {
                    ...systemSettings.auth,
                    arePollWorkerCardPinsEnabled: isChecked,
                  },
                })
              }
              disabled={!isEditing}
            />
            <InputGroup label="Inactive Session Time Limit">
              <SearchSelect
                aria-label="Inactive Session Time Limit"
                isMulti={false}
                isSearchable={false}
                value={systemSettings.auth.inactiveSessionTimeLimitMinutes.toString()}
                disabled={!isEditing}
                options={[
                  { value: '10', label: '10 minutes' },
                  { value: '15', label: '15 minutes' },
                  { value: '20', label: '20 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '360', label: '6 hours' },
                ]}
                onChange={(newValue) => {
                  setSystemSettings({
                    ...systemSettings,
                    auth: {
                      ...systemSettings.auth,
                      inactiveSessionTimeLimitMinutes:
                        safeParseInactiveSessionTimeLimit(newValue),
                    },
                  });
                }}
              />
            </InputGroup>
            <InputGroup label="Incorrect Pin Attempts Before Lockout">
              <SearchSelect
                aria-label="Incorrect Pin Attempts Before Lockout"
                isMulti={false}
                isSearchable={false}
                value={systemSettings.auth.numIncorrectPinAttemptsAllowedBeforeCardLockout.toString()}
                disabled={!isEditing}
                options={[
                  { value: '3', label: '3' },
                  { value: '4', label: '4' },
                  { value: '5', label: '5' },
                  { value: '6', label: '6' },
                  { value: '7', label: '7' },
                  { value: '8', label: '8' },
                  { value: '9', label: '9' },
                  { value: '10', label: '10' },
                ]}
                onChange={(newValue) => {
                  setSystemSettings({
                    ...systemSettings,
                    auth: {
                      ...systemSettings.auth,
                      numIncorrectPinAttemptsAllowedBeforeCardLockout:
                        safeParseIncorrectPinAttempts(newValue),
                    },
                  });
                }}
              />
            </InputGroup>
            <InputGroup label="Starting Card Lockout Duration">
              <SearchSelect
                aria-label="Starting Card Lockout Duration"
                isMulti={false}
                isSearchable={false}
                value={systemSettings.auth.startingCardLockoutDurationSeconds.toString()}
                disabled={!isEditing}
                options={[
                  { value: '15', label: '15 seconds' },
                  { value: '30', label: '30 seconds' },
                  { value: '60', label: '60 seconds' },
                ]}
                onChange={(newValue) => {
                  setSystemSettings({
                    ...systemSettings,
                    auth: {
                      // @coverage-defer
                      ...(systemSettings.auth || {}),
                      startingCardLockoutDurationSeconds:
                        safeParseStartingCardLockoutDurationSeconds(newValue),
                    },
                  });
                }}
              />
            </InputGroup>
            <InputGroup label="Overall Session Time Limit (Hours)">
              <input
                value={systemSettings.auth.overallSessionTimeLimitHours}
                type="number"
                step={1}
                min={1}
                max={12}
                disabled={!isEditing}
                onChange={(e) => {
                  setSystemSettings({
                    ...systemSettings,
                    auth: {
                      // @coverage-defer
                      ...(systemSettings.auth || {}),
                      overallSessionTimeLimitHours:
                        safeParseOverallSessionTimeLimit(
                          e.target.valueAsNumber
                        ),
                    },
                  });
                }}
              />
            </InputGroup>
          </Column>
        </Card>
        <Card>
          <H2>Polls Close Time</H2>
          <Column style={{ gap: '1.5rem' }}>
            <InputGroup label="Election Day Polls Close Time">
              <input
                // Force remount when edit mode is toggled to clear stale, partial, unsaved input state
                key={String(isEditing)}
                type="time"
                aria-label="Election Day Polls Close Time"
                value={
                  systemSettings.electionDayPollsCloseTime
                    ? systemSettings.electionDayPollsCloseTime.substring(0, 5)
                    : ''
                }
                onChange={(e) => {
                  const closeTime = e.target.value
                    ? `${e.target.value}:00`
                    : undefined;
                  setSystemSettings({
                    ...systemSettings,
                    electionDayPollsCloseTime: closeTime,
                    ...(closeTime === undefined
                      ? {
                          disallowClosingPollsBeforeElectionDayPollsCloseTime:
                            undefined,
                          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime:
                            undefined,
                        }
                      : {}),
                  });
                }}
                disabled={!isEditing}
              />
            </InputGroup>
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Disallow Closing Polls Before Election Day Polls Close Time"
              setting="disallowClosingPollsBeforeElectionDayPollsCloseTime"
              omitWhenUnchecked
              disabled={!isEditing || !systemSettings.electionDayPollsCloseTime}
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Disallow VxAdmin Tabulation Before Election Day Polls Close Time"
              setting="disallowVxAdminTabulationBeforeElectionDayPollsCloseTime"
              omitWhenUnchecked
              disabled={!isEditing || !systemSettings.electionDayPollsCloseTime}
            />
          </Column>
        </Card>
        <Card>
          <H2>Other</H2>
          <Column style={{ gap: '1.5rem' }}>
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Allow Official Ballots in Test Mode"
              setting="allowOfficialBallotsInTestMode"
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Disable Vertical Streak Detection"
              setting="disableVerticalStreakDetection"
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable Shoeshine Mode on VxScan"
              setting="precinctScanEnableShoeshineMode"
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable Write-In Image Report on VxScan"
              setting="precinctScanEnableWriteInImageReport"
              omitWhenUnchecked
            />
            <InputGroup label="Number of Report Copies on VxScan">
              <input
                type="number"
                // Empty when unset so the field can be cleared and retyped
                value={systemSettings.precinctScanNumberOfReportCopies ?? ''}
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    precinctScanNumberOfReportCopies: Number.isNaN(value)
                      ? undefined
                      : value,
                  });
                }}
                min={1}
                step={1}
                disabled={!isEditing}
              />
            </InputGroup>
            <InputGroup label="VxMark Print Mode">
              <SearchSelect<BmdPrintMode>
                aria-label="VxMark Print Mode"
                disabled={!isEditing}
                isMulti={false}
                isSearchable={false}
                onChange={(newValue) => {
                  setSystemSettings({
                    ...systemSettings,
                    // Feature still in development - omit when set to the
                    // default:
                    bmdPrintMode: newValue === 'summary' ? undefined : newValue,
                  });
                }}
                options={[
                  { label: 'Full Ballot Prints', value: 'bubble_ballot' },
                  {
                    label: 'Marks on Preprinted Ballots',
                    value: 'marks_on_preprinted_ballot',
                  },
                  { label: 'QR Code Summary Ballots', value: 'summary' },
                ]}
                style={{ width: '100%' }}
                value={systemSettings.bmdPrintMode || 'summary'}
              />
            </InputGroup>
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable Printing Blank Ballots from VxMark"
              setting="allowPrintingBlankBallotsFromVxMark"
              omitWhenUnchecked
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable QR Ballot Activation on VxMark"
              setting="bmdEnableQrBallotActivation"
              omitWhenUnchecked
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Include Redundant Metadata in CVRs"
              setting="castVoteRecordsIncludeRedundantMetadata"
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Qualified Write-In Candidate Mode"
              setting="areWriteInCandidatesQualified"
              omitWhenUnchecked
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable Early Voting"
              setting="enableEarlyVoting"
              omitWhenUnchecked
            />
            <SystemSettingsCheckbox
              {...checkboxProps}
              label="Enable Poll Worker Role on VxCentralScan"
              setting="centralScanEnablePollWorkerRole"
              omitWhenUnchecked
            />
          </Column>
        </Card>
        {features.UNDOCUMENTED_SYSTEM_SETTINGS && (
          <Card>
            <H2>Other Undocumented</H2>
            <Column style={{ gap: '1.5rem' }}>
              <P style={{ marginBottom: 0, maxWidth: '30rem' }}>
                Some of these are new and will eventually be documented. Others
                are unintended for toggling by test labs.
              </P>
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Disable Alarms on VxScan"
                setting="precinctScanDisableAlarms"
                omitWhenUnchecked
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Disable Screen Reader Audio on VxScan"
                setting="precinctScanDisableScreenReaderAudio"
                omitWhenUnchecked
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Transliterate Candidate Names"
                setting="shouldTransliterateCandidateNames"
              />
              <CheckboxButton
                label="Enable Live Reporting"
                isChecked={Boolean(systemSettings.quickResultsReportingUrl)}
                onChange={(isChecked) =>
                  setSystemSettings({
                    ...systemSettings,
                    quickResultsReportingUrl: isChecked
                      ? getResultsReportingUrlQuery.data
                      : undefined,
                  })
                }
                disabled={!isEditing}
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Disable System Limit Checks on Election Package Import"
                setting="disableSystemLimitChecks"
                omitWhenUnchecked
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Disable Voter Help Buttons"
                setting="disableVoterHelpButtons"
                omitWhenUnchecked
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Enable Test Deck Printing"
                setting="enableTestDeckPrinting"
                omitWhenUnchecked
              />
              <SystemSettingsCheckbox
                {...checkboxProps}
                label="Split Election Definition"
                setting="splitElectionDefinition"
                omitWhenUnchecked
              />
            </Column>
          </Card>
        )}
      </Row>
      {isEditing ? (
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon="Done"
            disabled={updateSystemSettingsMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button
            key="edit"
            variant="primary"
            icon="Edit"
            onPress={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </FormActionsRow>
      )}
      {isConfirmingMorningPollsCloseTime && (
        <Modal
          title="Polls Close Time Is In The Morning"
          content={
            <P>
              The polls close time is set to the morning. Are you sure this is
              correct?
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                icon="Done"
                onPress={() => {
                  setIsConfirmingMorningPollsCloseTime(false);
                  saveSettings();
                }}
              >
                Save
              </Button>
              <Button
                onPress={() => setIsConfirmingMorningPollsCloseTime(false)}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={
            // @coverage-exclude
            () => setIsConfirmingMorningPollsCloseTime(false)
          }
        />
      )}
    </Form>
  );
}

export function SystemSettingsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);

  useTitle(routes.election(electionId).systemSettings.title);

  if (!getSystemSettingsQuery.isSuccess) {
    return null;
  }

  const systemSettings = getSystemSettingsQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>System Settings</H1>
      </Header>
      <MainContent>
        <SystemSettingsForm
          electionId={electionId}
          savedSystemSettings={systemSettings}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
