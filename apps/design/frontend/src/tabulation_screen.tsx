import { useState } from 'react';
import { H1, H2, Button, Card } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { AdjudicationReason, Id, SystemSettings } from '@votingworks/types';
import { Form, FormField, Input, Column, Row, FormActionsRow } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { MultiSelect } from './multiselect';
import { updateSystemSettings, getElection } from './api';

type TabulationSettings = Pick<
  SystemSettings,
  | 'precinctScanAdjudicationReasons'
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

  return (
    <Form>
      <Row style={{ gap: '1rem' }}>
        <Card style={{ minWidth: '16rem' }}>
          <H2>Adjudication Reasons</H2>
          <Column style={{ gap: '1.5rem' }}>
            <FormField label="VxScan">
              <MultiSelect
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
            </FormField>
            <FormField label="VxCentralScan">
              <MultiSelect
                options={adjudicationReasonOptions}
                value={
                  (tabulationSettings.centralScanAdjudicationReasons ??
                    []) as string[]
                }
                onChange={(value) =>
                  setTabulationSettings({
                    ...tabulationSettings,
                    centralScanAdjudicationReasons:
                      value as AdjudicationReason[],
                  })
                }
                disabled={!isEditing}
              />
            </FormField>
          </Column>
        </Card>
        <Card style={{ minWidth: '16rem' }}>
          <H2>Mark Thresholds</H2>
          <Column style={{ gap: '1.5rem' }}>
            <FormField label="Definite Mark Threshold">
              <Input
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
            </FormField>
            <FormField label="Marginal Mark Threshold">
              <Input
                type="number"
                value={tabulationSettings.markThresholds?.marginal ?? ''}
                onChange={(e) =>
                  setTabulationSettings({
                    ...tabulationSettings,
                    markThresholds: {
                      ...(tabulationSettings.markThresholds || { definite: 0 }),
                      marginal: e.target.valueAsNumber,
                    },
                  })
                }
                step={0.01}
                min={0}
                max={1}
                disabled={!isEditing}
              />
            </FormField>
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
      <H1>Tabulation</H1>
      <TabulationForm
        electionId={electionId}
        savedSystemSettings={systemSettings}
      />
    </ElectionNavScreen>
  );
}
