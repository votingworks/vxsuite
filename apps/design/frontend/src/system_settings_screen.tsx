import { useState } from 'react';
import {
  H1,
  H2,
  Button,
  Card,
  CheckboxGroup,
  MainContent,
  MainHeader,
  CheckboxButton,
} from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import {
  AdjudicationReason,
  AdjudicationReasonSchema,
  ElectionId,
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

type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

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
    useState<DeepPartial<SystemSettings>>(savedSystemSettings);
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
                      definite: Number.isNaN(definite) ? undefined : definite,
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
                value={systemSettings.markThresholds?.marginal ?? ''}
                onChange={(e) => {
                  const marginal = e.target.valueAsNumber;
                  setSystemSettings({
                    ...systemSettings,
                    markThresholds: {
                      ...(systemSettings.markThresholds || {
                        definite: 0,
                      }),
                      marginal: Number.isNaN(marginal) ? undefined : marginal,
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
                  value={systemSettings.markThresholds?.writeInTextArea ?? ''}
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
            <Card>
              <H2>Other</H2>
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
