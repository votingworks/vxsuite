import React, { useState } from 'react';
import { Button, Icons, Loading, Modal, P, TD, Table } from '@votingworks/ui';
import styled from 'styled-components';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { NavigationScreen } from '../navigation_screen';
import { BatchSummaryStats } from '../components/batch_summary_stats';
import { BatchSyncIndicator } from '../components/batch_sync_indicator';
import { SaveCvrsButton } from '../components/save_cvrs_button';
import { clearBallotData, getCvrSyncStatus } from '../api';
import { shortDateTime } from '../util/date_time';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;

const StatusCell = styled(TD)`
  width: 14rem;
`;

export interface BatchHistoryScreenProps {
  status: ScanStatus;
  canDeleteBatches?: boolean;
}

export function BatchHistoryScreen({
  status,
  canDeleteBatches,
}: BatchHistoryScreenProps): JSX.Element {
  const cvrSyncStatusQuery = getCvrSyncStatus.useQuery();
  const isBatchOpen = !!status.currentBatch;
  // the open batch appears on the scan screen, not in the history
  const batches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );

  const [deleteBallotDataFlowState, setDeleteBallotDataFlowState] = useState<
    'confirmation' | 'deleting'
  >();
  const clearBallotDataMutation = clearBallotData.useMutation();

  function resetDeleteBallotDataFlow() {
    setDeleteBallotDataFlowState(undefined);
  }
  function deleteBallotData() {
    setDeleteBallotDataFlowState('deleting');
    clearBallotDataMutation.mutate(undefined, {
      onSuccess: resetDeleteBallotDataFlow,
    });
  }

  return (
    <NavigationScreen title="Batch History">
      <Content>
        <BatchSummaryStats status={status} callout />
        {batches.length > 0 && (
          <React.Fragment>
            <div>
              <Table>
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Sheet Count</th>
                    <th>Started At</th>
                    <th>Finished At</th>
                    <th>Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.label}</td>
                      <td>{format.count(batch.count)}</td>
                      <TD nowrap>{shortDateTime(batch.startedAt)}</TD>
                      <TD nowrap>
                        {batch.endedAt ? shortDateTime(batch.endedAt) : null}
                      </TD>
                      <StatusCell nowrap>
                        <BatchSyncIndicator
                          batch={batch}
                          cvrSyncStatus={cvrSyncStatusQuery.data}
                        />
                      </StatusCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {canDeleteBatches && (
              <ActionsRow>
                <SaveCvrsButton />
                <Button
                  icon="Delete"
                  color="danger"
                  disabled={isBatchOpen}
                  onPress={() => setDeleteBallotDataFlowState('confirmation')}
                >
                  Delete All Batches
                </Button>
              </ActionsRow>
            )}
          </React.Fragment>
        )}
      </Content>
      {deleteBallotDataFlowState === 'confirmation' &&
        (status.canUnconfigure ? (
          <Modal
            title="Delete All Batches"
            content={<P>All batches and CVRs will be permanently deleted.</P>}
            actions={
              <React.Fragment>
                <Button
                  variant="danger"
                  icon="Delete"
                  onPress={deleteBallotData}
                  autoFocus
                >
                  Delete All Batches
                </Button>
                <Button onPress={resetDeleteBallotDataFlow}>Cancel</Button>
              </React.Fragment>
            }
            onOverlayClick={resetDeleteBallotDataFlow}
          />
        ) : (
          <Modal
            title={
              <span>
                <Icons.Warning color="warning" /> CVR Backup Required
              </span>
            }
            content={
              <P>You must save CVRs before you can delete all batches.</P>
            }
            actions={<Button onPress={resetDeleteBallotDataFlow}>Close</Button>}
            onOverlayClick={resetDeleteBallotDataFlow}
          />
        ))}
      {deleteBallotDataFlowState === 'deleting' && (
        <Modal centerContent content={<Loading>Deleting Batches</Loading>} />
      )}
    </NavigationScreen>
  );
}
