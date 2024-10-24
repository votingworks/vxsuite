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
import { AdjudicationReason, Id, SystemSettings } from '@votingworks/types';
import { Form, Column, Row, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { updateSystemSettings, getElection } from './api';

type TabulationSettings = Pick<
  SystemSettings,
  | 'precinctScanAdjudicationReasons'
  | 'disallowCastingOvervotes'
  | 'centralScanAdjudicationReasons'
  | 'markThresholds'
>;

export function TabulationForm({
  electionId,
  savedSystemSettings,
}: {
  electionId: Id;
  savedSystemSettings: SystemSettings;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [tabulationSettings, setTabulationSettings] =
    useState<TabulationSettings>(savedSystemSettings);
  const updateSystemSettingsMutation = updateSystemSettings.useMutation();

  function onSaveButtonPress() {
    updateSystemSettingsMutation.mutate(
      {
        electionId,
        systemSettings: { ...savedSystemSettings, ...tabulationSettings },
      },
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

  const isScoringUnmarkedWriteIns =
    tabulationSettings.centralScanAdjudicationReasons.includes(
      AdjudicationReason.UnmarkedWriteIn
    ) ||
    tabulationSettings.precinctScanAdjudicationReasons.includes(
      AdjudicationReason.UnmarkedWriteIn
    );

  return (
    <Form>
      <Row style={{ gap: '1rem' }}>
        <Card>
          <H2>Adjudication Reasons</H2>
          <Column style={{ gap: '1.5rem' }}>
            <CheckboxGroup
              label="VxScan"
              options={adjudicationReasonOptions}
              value={
                (tabulationSettings.precinctScanAdjudicationReasons ??
                  []) as string[]
              }
              onChange={(value) =>
                setTabulationSettings({
                  ...tabulationSettings,
                  precinctScanAdjudicationReasons:
                    value as AdjudicationReason[],
                })
              }
              disabled={!isEditing}
            />
            <CheckboxButton
              label="Disallow Casting Overvotes"
              isChecked={tabulationSettings.disallowCastingOvervotes}
              onChange={(isChecked) =>
                setTabulationSettings({
                  ...tabulationSettings,
                  disallowCastingOvervotes: isChecked,
                })
              }
              disabled={!isEditing}
            />
            <CheckboxGroup
              label="VxCentralScan"
              options={adjudicationReasonOptions}
              value={
                (tabulationSettings.centralScanAdjudicationReasons ??
                  []) as string[]
              }
              onChange={(value) =>
                setTabulationSettings({
                  ...tabulationSettings,
                  centralScanAdjudicationReasons: value as AdjudicationReason[],
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
                value={tabulationSettings.markThresholds?.definite ?? ''}
                onChange={(e) =>
                  setTabulationSettings({
                    ...tabulationSettings,
                    markThresholds: {
                      ...(tabulationSettings.markThresholds || { marginal: 0 }),
                      definite: e.target.valueAsNumber,
                    },
                  })
                }
                step={0.01}
                min={0}
                max={1}
                disabled={!isEditing}
              />
            </InputGroup>
            <InputGroup label="Marginal Mark Threshold">
              <input
                type="number"
                value={tabulationSettings.markThresholds?.marginal ?? ''}
                onChange={(e) =>
                  setTabulationSettings({
                    ...tabulationSettings,
                    markThresholds: {
                      ...(tabulationSettings.markThresholds || {
                        definite: 0,
                      }),
                      marginal: e.target.valueAsNumber,
                    },
                  })
                }
                step={0.01}
                min={0}
                max={1}
                disabled={!isEditing}
              />
            </InputGroup>
            {isScoringUnmarkedWriteIns && (
              <InputGroup label="Write-In Area Threshold">
                <input
                  type="number"
                  value={
                    tabulationSettings.markThresholds?.writeInTextArea ?? ''
                  }
                  onChange={(e) =>
                    setTabulationSettings({
                      ...tabulationSettings,
                      markThresholds: {
                        ...(tabulationSettings.markThresholds || {
                          definite: 0,
                          marginal: 0,
                        }),
                        writeInTextArea: e.target.valueAsNumber,
                      },
                    })
                  }
                  step={0.01}
                  min={0}
                  max={1}
                  disabled={!isEditing}
                />
              </InputGroup>
            )}
          </Column>
        </Card>
      </Row>
      {isEditing ? (
        <FormActionsRow>
          <Button
            onPress={() => {
              setTabulationSettings(savedSystemSettings);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button onPress={onSaveButtonPress} variant="primary" icon="Done">
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button
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

export function TabulationScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { systemSettings } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Tabulation</H1>
      </MainHeader>
      <MainContent>
        <TabulationForm
          electionId={electionId}
          savedSystemSettings={systemSettings}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
