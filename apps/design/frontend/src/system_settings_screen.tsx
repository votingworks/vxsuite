import { useState } from 'react';
import {
  H1,
  H2,
  Button,
  Card,
  CheckboxGroup,
  MainContent,
  CheckboxButton,
  SearchSelect,
} from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import {
  AdjudicationReason,
  AdjudicationReasonSchema,
  DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
  DEFAULT_MARK_THRESHOLDS,
  DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  ElectionId,
  InactiveSessionTimeLimitMinutes,
  InactiveSessionTimeLimitMinutesSchema,
  NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema,
  OverallSessionTimeLimitHours,
  OverallSessionTimeLimitHoursSchema,
  safeParse,
  safeParseInt,
  StartingCardLockoutDurationSeconds,
  StartingCardLockoutDurationSecondsSchema,
  SystemSettings,
  unsafeParse,
} from '@votingworks/types';
import { z } from 'zod/v4';
import { Form, Column, Row, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import {
  updateSystemSettings,
  getUserFeatures,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';

function safeParseFormValue<T>(
  schema: z.ZodSchema<T>,
  defaultValue: T,
  value?: string | number
): T {
  let intValue = value;
  if (typeof value === 'string') {
    const parseResult = safeParseInt(value);
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
  const updateSystemSettingsMutation = updateSystemSettings.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  function onSubmit() {
    updateSystemSettingsMutation.mutate(
      { electionId, systemSettings },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  const adjudicationReasonOptions = [
    { label: 'Overvote', value: AdjudicationReason.Overvote },
    { label: 'Undervote', value: AdjudicationReason.Undervote },
    { label: 'Marginal Mark', value: AdjudicationReason.MarginalMark },
    { label: 'Blank Ballot', value: AdjudicationReason.BlankBallot },
    { label: 'Unmarked Write-In', value: AdjudicationReason.UnmarkedWriteIn },
  ];

  const scannerAdjudicationReasonOptions = adjudicationReasonOptions.filter(
    // Not implemented
    (option) => option.value !== AdjudicationReason.MarginalMark
  );

  const adminAdjudicationReasonOptions = adjudicationReasonOptions.filter(
    (option) =>
      // Not implemented
      option.value !== AdjudicationReason.BlankBallot &&
      // UnmarkedWriteIn is excluded from adminAdjudicationReasons because
      // admin will surface all unmarked write-ins that the scanner tags.
      // It is effectively equal to the scanner's adjudication setting.
      option.value !== AdjudicationReason.UnmarkedWriteIn
  );

  enum CvrOption {
    RedudantMetadata = 'Redundant Metadata',
  }

  const cvrOptions = [
    { label: 'Include Redundant Metadata', value: CvrOption.RedudantMetadata },
  ];

  const isScoringUnmarkedWriteIns =
    systemSettings.centralScanAdjudicationReasons?.includes(
      AdjudicationReason.UnmarkedWriteIn
    ) ||
    systemSettings.precinctScanAdjudicationReasons?.includes(
      AdjudicationReason.UnmarkedWriteIn
    );

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
      <Row style={{ gap: '1rem' }}>
        <Card>
          <H2>Adjudication Reasons</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxGroup
              label="VxScan"
              options={scannerAdjudicationReasonOptions}
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
            <CheckboxButton
              label="Disallow Casting Overvotes"
              isChecked={systemSettings.disallowCastingOvervotes ?? false}
              onChange={(isChecked) =>
                setSystemSettings({
                  ...systemSettings,
                  disallowCastingOvervotes: isChecked,
                })
              }
              disabled={!isEditing}
            />
            <CheckboxGroup
              label="VxCentralScan"
              options={scannerAdjudicationReasonOptions}
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
          </Column>
        </Card>
        <Card style={{ minWidth: '16rem' }}>
          <H2>Scanner Thresholds</H2>
          <Column style={{ gap: '1.5rem' }}>
            <InputGroup label="Definite Mark Threshold">
              <input
                type="number"
                value={systemSettings.markThresholds?.definite ?? ''}
                onChange={(e) => {
                  const definite = e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    markThresholds: {
                      ...(systemSettings.markThresholds || { marginal: 0 }),
                      definite: Number.isNaN(definite)
                        ? DEFAULT_MARK_THRESHOLDS.definite
                        : definite,
                    },
                  });
                }}
                step={0.01}
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
                      ...(systemSettings.markThresholds || {
                        definite: 0,
                      }),
                      marginal: Number.isNaN(marginal)
                        ? DEFAULT_MARK_THRESHOLDS.marginal
                        : marginal,
                    },
                  });
                }}
                step={0.01}
                min={0}
                max={1}
                disabled={!isEditing}
                required
              />
            </InputGroup>
            {isScoringUnmarkedWriteIns && (
              <InputGroup label="Write-In Area Threshold">
                <input
                  type="number"
                  value={systemSettings.markThresholds.writeInTextArea}
                  onChange={(e) => {
                    const writeInTextArea = e.target.valueAsNumber;
                    setSystemSettings({
                      ...systemSettings,
                      markThresholds: {
                        ...(systemSettings.markThresholds || {
                          definite: 0,
                          marginal: 0,
                        }),
                        writeInTextArea: Number.isNaN(writeInTextArea)
                          ? undefined
                          : writeInTextArea,
                      },
                    });
                  }}
                  step={0.01}
                  min={0}
                  max={1}
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
          <H2>Other</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxButton
              label="Allow Official Ballots in Test Mode"
              isChecked={Boolean(systemSettings.allowOfficialBallotsInTestMode)}
              onChange={(isChecked) =>
                setSystemSettings({
                  ...systemSettings,
                  allowOfficialBallotsInTestMode: isChecked,
                })
              }
              disabled={!isEditing}
            />
            <CheckboxButton
              label="Disable Vertical Streak Detection"
              isChecked={Boolean(systemSettings.disableVerticalStreakDetection)}
              onChange={(isChecked) =>
                setSystemSettings({
                  ...systemSettings,
                  disableVerticalStreakDetection: isChecked,
                })
              }
              disabled={!isEditing}
            />
            <CheckboxButton
              label="Enable Shoeshine Mode on VxScan"
              isChecked={Boolean(
                systemSettings.precinctScanEnableShoeshineMode
              )}
              onChange={(isChecked) =>
                setSystemSettings({
                  ...systemSettings,
                  precinctScanEnableShoeshineMode: isChecked,
                })
              }
              disabled={!isEditing}
            />
            {features.ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_OPTION && (
              <CheckboxButton
                label="Enable BMD Ballot Scanning on VxScan"
                isChecked={Boolean(
                  systemSettings.precinctScanEnableBmdBallotScanning
                )}
                onChange={(isChecked) =>
                  setSystemSettings({
                    ...systemSettings,
                    precinctScanEnableBmdBallotScanning: isChecked
                      ? true
                      : undefined, // Completely omit when unchecked
                  })
                }
                disabled={!isEditing}
              />
            )}
            {features.BMD_OVERVOTE_ALLOW_TOGGLE && (
              <CheckboxButton
                label="Allow Overvote Marking on VxMark"
                isChecked={Boolean(systemSettings.bmdAllowOvervotes)}
                onChange={(isChecked) =>
                  setSystemSettings({
                    ...systemSettings,
                    bmdAllowOvervotes: isChecked ? true : undefined, // Completely omit when unchecked
                  })
                }
                disabled={!isEditing}
              />
            )}
            <CheckboxGroup
              label="CVR"
              options={cvrOptions}
              value={[
                systemSettings.castVoteRecordsIncludeRedundantMetadata
                  ? CvrOption.RedudantMetadata
                  : undefined,
              ].filter((v) => v !== undefined)}
              onChange={(value) =>
                setSystemSettings({
                  ...systemSettings,
                  castVoteRecordsIncludeRedundantMetadata: value.includes(
                    CvrOption.RedudantMetadata
                  ),
                })
              }
              disabled={!isEditing}
            />
          </Column>
        </Card>
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
