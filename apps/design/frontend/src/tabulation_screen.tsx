/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import { H1, H2, Button, Icons } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { AdjudicationReason, Election, Id } from '@votingworks/types';
import { Form, FormField, Input, Card, Row, FormActionsRow } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { MultiSelect } from './multiselect';
import { updateElection, getElection } from './api';

// type TabulationSettings = Pick<
//   Election,
//   | 'precinctScanAdjudicationReasons'
//   | 'centralScanAdjudicationReasons'
//   | 'markThresholds'
// >;

export function TabulationForm({
  electionId,
  savedElection,
}: {
  electionId: Id;
  savedElection: Election;
}): JSX.Element {
  return <div>Temporarily disabled</div>;
  // const [isEditing, setIsEditing] = useState(false);
  // const [tabulationSettings, setTabulationSettings] =
  //   useState<TabulationSettings>(savedElection);
  // const updateElectionMutation = updateElection.useMutation();

  // function onSaveButtonPress() {
  //   updateElectionMutation.mutate(
  //     { electionId, election: { ...savedElection, ...tabulationSettings } },
  //     { onSuccess: () => setIsEditing(false) }
  //   );
  // }

  // const adjudicationReasonOptions = [
  //   { label: 'Overvote', value: AdjudicationReason.Overvote },
  //   { label: 'Undervote', value: AdjudicationReason.Undervote },
  //   { label: 'Marginal Mark', value: AdjudicationReason.MarginalMark },
  //   { label: 'Blank Ballot', value: AdjudicationReason.BlankBallot },
  // ];

  // return (
  //   <Form>
  //     <Row style={{ gap: '1rem', marginBottom: '1rem' }}>
  //       <Card style={{ minWidth: '16rem' }}>
  //         <H2>Adjudication Reasons</H2>
  //         <FormField label="VxScan">
  //           <MultiSelect
  //             options={adjudicationReasonOptions}
  //             value={
  //               (tabulationSettings.precinctScanAdjudicationReasons ??
  //                 []) as string[]
  //             }
  //             onChange={(value) =>
  //               setTabulationSettings({
  //                 ...tabulationSettings,
  //                 precinctScanAdjudicationReasons:
  //                   value as AdjudicationReason[],
  //               })
  //             }
  //             disabled={!isEditing}
  //           />
  //         </FormField>
  //         <FormField label="VxCentralScan">
  //           <MultiSelect
  //             options={adjudicationReasonOptions}
  //             value={
  //               (tabulationSettings.centralScanAdjudicationReasons ??
  //                 []) as string[]
  //             }
  //             onChange={(value) =>
  //               setTabulationSettings({
  //                 ...tabulationSettings,
  //                 centralScanAdjudicationReasons: value as AdjudicationReason[],
  //               })
  //             }
  //             disabled={!isEditing}
  //           />
  //         </FormField>
  //       </Card>
  //       <Card style={{ minWidth: '16rem' }}>
  //         <H2>Mark Thresholds</H2>
  //         <FormField label="Definite Mark Threshold">
  //           <Input
  //             type="number"
  //             value={tabulationSettings.markThresholds?.definite ?? ''}
  //             onChange={(e) =>
  //               setTabulationSettings({
  //                 ...tabulationSettings,
  //                 markThresholds: {
  //                   ...(tabulationSettings.markThresholds || { marginal: 0 }),
  //                   definite: e.target.valueAsNumber,
  //                 },
  //               })
  //             }
  //             step={0.01}
  //             min={0}
  //             max={1}
  //             disabled={!isEditing}
  //           />
  //         </FormField>
  //         <FormField label="Marginal Mark Threshold">
  //           <Input
  //             type="number"
  //             value={tabulationSettings.markThresholds?.marginal ?? ''}
  //             onChange={(e) =>
  //               setTabulationSettings({
  //                 ...tabulationSettings,
  //                 markThresholds: {
  //                   ...(tabulationSettings.markThresholds || { definite: 0 }),
  //                   marginal: e.target.valueAsNumber,
  //                 },
  //               })
  //             }
  //             step={0.01}
  //             min={0}
  //             max={1}
  //             disabled={!isEditing}
  //           />
  //         </FormField>
  //       </Card>
  //     </Row>
  //     {isEditing ? (
  //       <FormActionsRow>
  //         <Button onPress={() => setIsEditing(false)}>Cancel</Button>
  //         <Button onPress={onSaveButtonPress} variant="primary">
  //           <Icons.Checkmark /> Save
  //         </Button>
  //       </FormActionsRow>
  //     ) : (
  //       <FormActionsRow>
  //         <Button variant="primary" onPress={() => setIsEditing(true)}>
  //           <Icons.Edit /> Edit
  //         </Button>
  //       </FormActionsRow>
  //     )}
  //   </Form>
  // );
}

export function TabulationScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <H1>Tabulation</H1>
      <TabulationForm electionId={electionId} savedElection={election} />
    </ElectionNavScreen>
  );
}
