import React, { useState } from 'react';
import pluralize from 'pluralize';
import {
  Button,
  Callout,
  Font,
  Icons,
  Loading,
  Modal,
  P,
  TD,
  Table,
} from '@votingworks/ui';
import { BatchInfo } from '@votingworks/types';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { DeleteBatchModal } from '../components/delete_batch_modal';
import { NavigationScreen } from '../navigation_screen';
import { ExportResultsModal } from '../components/export_results_modal';
import { SendCvrsModal } from '../components/send_cvrs_modal';
import { BatchControlCard } from '../components/batch_control_card';
import { clearBallotData, getHostConnectionInfo } from '../api';
import { shortDateTime } from '../util/date_time';

pluralize.addIrregularRule('requires', 'require');
pluralize.addIrregularRule('has', 'have');

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TopBarStats = styled(Callout)`
  div {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    gap: 2rem;
  }

  p {
    margin-bottom: 0;
  }
`;

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const DeleteAllWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export interface ScanBallotsScreenProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
}

export function ScanBallotsScreen({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
}: ScanBallotsScreenProps): JSX.Element {
  const isBatchOpen = !!status.currentBatch;
  // the open batch appears in the batch control card, not the saved list
  const batches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );
  const batchCount = batches.length;

  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);
  const [isSendingCvrs, setIsSendingCvrs] = useState(false);
  const hostConnectionInfoQuery = getHostConnectionInfo.useQuery();
  const isHostConnected =
    hostConnectionInfoQuery.data?.status === 'connected-to-host';
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<BatchInfo>();
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

  let exportButtonTitle;
  if (status.adjudicationsRemaining > 0) {
    exportButtonTitle =
      'You cannot save results until all sheets have been adjudicated.';
  } else if (isBatchOpen) {
    exportButtonTitle = 'You cannot save results while a batch is in progress.';
  } else if (batches.length === 0) {
    exportButtonTitle =
      'You cannot save results until you have scanned at least one sheet.';
  }

  let sendButtonTitle = exportButtonTitle;
  if (!sendButtonTitle && !isHostConnected) {
    sendButtonTitle =
      'You cannot send results until a VxAdmin is detected on the network.';
  }

  return (
    <NavigationScreen title="Scan Ballots">
      <Content>
        {isPollingPlaceUnconfigured && (
          <Callout color="warning" icon="Warning">
            No polling place selected. Select a polling place on the Settings
            screen before scanning ballots.
          </Callout>
        )}
        <BatchControlCard
          status={status}
          statusIsStale={statusIsStale}
          isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
        />
        <TopBar>
          {batchCount ? (
            <TopBarStats color="neutral" style={{ gap: '3rem' }}>
              <P>
                <Font weight="bold">Saved Batches:</Font>{' '}
                {format.count(batchCount)}
              </P>
              <P>
                <Font weight="bold">Total Sheets:</Font>{' '}
                {format.count(ballotCount)}
              </P>
            </TopBarStats>
          ) : (
            <P>
              <Icons.Info /> No batches have been saved
            </P>
          )}
          <TopBarActions>
            <Button
              onPress={() => setIsSendingCvrs(true)}
              disabled={
                status.adjudicationsRemaining > 0 ||
                isBatchOpen ||
                batches.length === 0 ||
                !isHostConnected
              }
              nonAccessibleTitle={sendButtonTitle}
              icon="Upload"
              color="primary"
            >
              Send CVRs
            </Button>
            <Button
              onPress={() => setIsExportingCvrs(true)}
              disabled={
                status.adjudicationsRemaining > 0 ||
                isBatchOpen ||
                batches.length === 0
              }
              nonAccessibleTitle={exportButtonTitle}
              icon="Export"
              color="primary"
            >
              Save CVRs
            </Button>
          </TopBarActions>
        </TopBar>
        {batchCount ? (
          <React.Fragment>
            <div>
              <Table>
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Sheet Count</th>
                    <th>Started At</th>
                    <th>Finished At</th>
                    <th>&nbsp;</th>
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
                      <TD narrow>
                        <Button
                          icon="Delete"
                          fill="transparent"
                          color="danger"
                          onPress={() => setPendingDeleteBatch(batch)}
                          style={{ flexWrap: 'nowrap' }}
                          disabled={isBatchOpen}
                        >
                          Delete
                        </Button>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <DeleteAllWrapper>
              <Button
                icon="Delete"
                color="danger"
                disabled={isBatchOpen}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete All Batches
              </Button>
            </DeleteAllWrapper>
          </React.Fragment>
        ) : null}
      </Content>
      {pendingDeleteBatch && (
        <DeleteBatchModal
          batchId={pendingDeleteBatch.id}
          batchLabel={pendingDeleteBatch.label}
          onClose={() => setPendingDeleteBatch(undefined)}
        />
      )}
      {isExportingCvrs && (
        <ExportResultsModal onClose={() => setIsExportingCvrs(false)} />
      )}
      {isSendingCvrs && (
        <SendCvrsModal onClose={() => setIsSendingCvrs(false)} />
      )}
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
