import React, { useState } from 'react';
import {
  H1,
  H2,
  Button,
  Card,
  CheckboxGroup,
  MainContent,
  MainHeader,
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
  SystemSettingsSchema,
  unsafeParse,
} from '@votingworks/types';
import { z } from 'zod';
import type { BallotTemplateId } from '@votingworks/design-backend';
import { Form, Column, Row, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { updateSystemSettings, getElection } from './api';

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
  ballotTemplateId,
  electionId,
  savedSystemSettings,
}: {
  ballotTemplateId: BallotTemplateId;
  electionId: ElectionId;
  savedSystemSettings: SystemSettings;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [systemSettings, setSystemSettings] =
    useState<SystemSettings>(savedSystemSettings);
  const updateSystemSettingsMutation = updateSystemSettings.useMutation();

  function onSubmit() {
    updateSystemSettingsMutation.mutate(
      {
        electionId,
        systemSettings: unsafeParse(SystemSettingsSchema, {
          ...savedSystemSettings,
          ...systemSettings,
        }),
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  }

  function onReset() {
    if (isEditing) {
      setSystemSettings(savedSystemSettings);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }

  const adjudicationReasonOptions = [
    { label: 'Overvote', value: AdjudicationReason.Overvote },
    { label: 'Undervote', value: AdjudicationReason.Undervote },
    { label: 'Marginal Mark', value: AdjudicationReason.MarginalMark },
    { label: 'Blank Ballot', value: AdjudicationReason.BlankBallot },
    { label: 'Unmarked Write-In', value: AdjudicationReason.UnmarkedWriteIn },
  ];

  enum CvrOption {
    OriginalSnapshots = 'Original Snapshots',
    RedudantMetadata = 'Redundant Metadata',
  }

  const cvrOptions = [
    { label: 'Include Original Snapshots', value: CvrOption.OriginalSnapshots },
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
        onReset();
      }}
    >
      <Row style={{ gap: '1rem' }}>
        <Card>
          <H2>Adjudication Reasons</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxGroup
              label="VxScan"
              options={adjudicationReasonOptions}
              value={
                (systemSettings.precinctScanAdjudicationReasons ??
                  []) as string[]
              }
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
              options={adjudicationReasonOptions}
              value={
                (systemSettings.centralScanAdjudicationReasons ??
                  []) as string[]
              }
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
          </Column>
        </Card>
        <Card style={{ minWidth: '16rem' }}>
          <H2>Mark Thresholds</H2>
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
          </Column>
        </Card>
        {ballotTemplateId !== 'NhBallotV3' &&
          ballotTemplateId !== 'NhBallotV3Compact' && (
            <React.Fragment>
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
                      ariaLabel="Inactive Session Time Limit"
                      isMulti={false}
                      isSearchable={false}
                      value={systemSettings.auth.inactiveSessionTimeLimitMinutes.toString()}
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
                      ariaLabel="Incorrect Pin Attempts Before Lockout"
                      isMulti={false}
                      isSearchable={false}
                      value={systemSettings.auth.numIncorrectPinAttemptsAllowedBeforeCardLockout.toString()}
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
                      ariaLabel="Starting Card Lockout Duration"
                      isMulti={false}
                      isSearchable={false}
                      value={systemSettings.auth.startingCardLockoutDurationSeconds.toString()}
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
                              safeParseStartingCardLockoutDurationSeconds(
                                newValue
                              ),
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
                    isChecked={Boolean(
                      systemSettings.allowOfficialBallotsInTestMode
                    )}
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
                    isChecked={Boolean(
                      systemSettings.disableVerticalStreakDetection
                    )}
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
                  <CheckboxGroup
                    label="CVR"
                    options={cvrOptions}
                    value={
                      [
                        systemSettings.castVoteRecordsIncludeOriginalSnapshots
                          ? CvrOption.OriginalSnapshots
                          : undefined,
                        systemSettings.castVoteRecordsIncludeRedundantMetadata
                          ? CvrOption.RedudantMetadata
                          : undefined,
                      ].filter((v) => v !== undefined) as string[]
                    }
                    onChange={(value) =>
                      setSystemSettings({
                        ...systemSettings,
                        castVoteRecordsIncludeOriginalSnapshots: value.includes(
                          CvrOption.OriginalSnapshots
                        ),
                        castVoteRecordsIncludeRedundantMetadata: value.includes(
                          CvrOption.RedudantMetadata
                        ),
                      })
                    }
                    disabled={!isEditing}
                  />
                </Column>
              </Card>
            </React.Fragment>
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
          <Button type="reset" variant="primary" icon="Edit">
            Edit
          </Button>
        </FormActionsRow>
      )}
    </Form>
  );
}

export function SystemSettingsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { ballotTemplateId, systemSettings } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>System Settings</H1>
      </MainHeader>
      <MainContent>
        <SystemSettingsForm
          ballotTemplateId={ballotTemplateId}
          electionId={electionId}
          savedSystemSettings={systemSettings}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
