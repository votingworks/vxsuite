import React, { useState } from 'react';
import {
  Button,
  Callout,
  Icons,
  Loading,
  Modal,
  P,
  TD,
  TableCard,
} from '@votingworks/ui';
import { BatchInfo } from '@votingworks/types';
import styled from 'styled-components';
import type {
  NetworkConnectionInfo,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { DeleteBatchModal } from '../components/delete_batch_modal.js';
import { NavigationScreen } from '../navigation_screen.js';
import { ExportResultsModal } from '../components/export_results_modal.js';
import { BatchSummaryStats } from '../components/batch_summary_stats.js';
import {
  clearBallotData,
  getNetworkStatus,
  resendBatchToAdmin,
  retrySendBatchToAdmin,
} from '../api.js';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
`;

const TopBar = styled.div`
  display: flex;
  align-items: stretch;
  gap: 1rem;

  > :first-child {
    flex: 1;
  }
`;

const BatchTableCard = styled(TableCard)`
  flex: 1;
`;

const SyncStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  button {
    padding: 0.5rem 0.75rem;
  }
`;

const SyncLabel = styled.span`
  min-width: 8ch;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;

  button {
    padding: 0.5rem 0.75rem;
  }
`;

const ActionsStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export interface BatchHistoryScreenProps {
  status: ScanStatus;
}

/**
 * A screen-level warning for VxAdmin refusing this machine's batches for a
 * reason that applies to every batch, so it isn't repeated per row.
 */
function SendingPausedCallout({
  connection,
}: {
  connection: NetworkConnectionInfo;
}): JSX.Element | null {
  switch (connection.status) {
    case 'online-results-official':
      return (
        <Callout color="warning" icon="Warning">
          <div>
            <strong>Sync Stopped:</strong> VxAdmin ({connection.hostMachineId})
            has marked its results official.
          </div>
        </Callout>
      );
    case 'online-invalid-mode':
      return (
        <Callout color="warning" icon="Warning">
          <div>
            <strong>Sync Stopped:</strong> VxAdmin ({connection.hostMachineId})
            is tabulating {connection.hostCvrFileMode} ballots, but this machine
            is scanning{' '}
            {connection.hostCvrFileMode === 'official' ? 'test' : 'official'}{' '}
            ballots.
          </div>
        </Callout>
      );
    default:
      return null;
  }
}

interface BatchSendState {
  icon: JSX.Element;
  label: string;
  action?: 'retry' | 'resend';
}

function getBatchSendState(batch: BatchInfo): BatchSendState {
  if (batch.sentToAdminAt) {
    if (batch.removedFromAdminAt) {
      return {
        icon: <Icons.Cancel color="warning" />,
        label: 'Removed',
        action: 'resend',
      };
    }
    return { icon: <Icons.Done color="primary" />, label: 'Sent' };
  }
  if (batch.sendToAdminError) {
    return {
      icon: <Icons.Danger color="danger" />,
      label: 'Failed',
      action: 'retry',
    };
  }
  // Covers the attempt in flight and any wait to retry after a transient
  // failure, so the cell doesn't flicker between attempts.
  if (batch.isSendingToAdmin) {
    return { icon: <Icons.Loading />, label: 'Sending…' };
  }
  return { icon: <Icons.Circle />, label: 'Not sent' };
}

export function BatchHistoryScreen({
  status,
}: BatchHistoryScreenProps): JSX.Element {
  const { batches, state } = status;
  const isScanning = state === 'scanning';

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<BatchInfo>();
  const networkStatusQuery = getNetworkStatus.usePollingQuery();
  const networkStatus = networkStatusQuery.data;
  const isNetworkingEnabled = networkStatus?.isEnabled ?? false;
  const retrySendMutation = retrySendBatchToAdmin.useMutation();
  const resendMutation = resendBatchToAdmin.useMutation();
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
        <TopBar>
          <BatchSummaryStats status={status} />
          <ActionsStack>
            <Button
              onPress={() => setIsExportingCvrs(true)}
              icon="Export"
              fill="tinted"
              color="primary"
              disabled={batches.length === 0}
            >
              Save CVRs
            </Button>
            <Button
              icon="Delete"
              // color="danger"
              fill="tinted"
              disabled={batches.length === 0 || isScanning}
              onPress={() => setDeleteBallotDataFlowState('confirmation')}
            >
              Delete All Batches
            </Button>
          </ActionsStack>
        </TopBar>
        {isNetworkingEnabled && networkStatus && (
          <SendingPausedCallout connection={networkStatus.connection} />
        )}
        {batches.length > 0 && (
          <BatchTableCard>
            <thead>
              <tr>
                {isNetworkingEnabled && <th>VxAdmin&nbsp;Sync</th>}
                <th>Batch</th>
                <th>Sheets</th>
                <th>Scanned At</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const sendState = isNetworkingEnabled
                  ? getBatchSendState(batch)
                  : undefined;
                const timestamp = batch.endedAt ?? batch.startedAt;
                return (
                  <tr key={batch.id}>
                    {sendState && (
                      <TD>
                        <SyncStatus>
                          {sendState.icon}
                          <SyncLabel>{sendState.label}</SyncLabel>
                          {sendState.action === 'retry' && (
                            <Button
                              icon="Redo"
                              fill="transparent"
                              onPress={() =>
                                retrySendMutation.mutate({
                                  batchId: batch.id,
                                })
                              }
                              disabled={retrySendMutation.isLoading}
                            >
                              Retry
                            </Button>
                          )}
                          {sendState.action === 'resend' && (
                            <Button
                              icon="Redo"
                              fill="transparent"
                              onPress={() =>
                                resendMutation.mutate({ batchId: batch.id })
                              }
                              disabled={resendMutation.isLoading}
                            >
                              Resend
                            </Button>
                          )}
                        </SyncStatus>
                      </TD>
                    )}
                    <TD nowrap>{batch.label}</TD>
                    <TD>{format.count(batch.count)}</TD>
                    <TD nowrap>
                      {isScanning && !batch.endedAt ? (
                        <SyncStatus>
                          <Icons.Loading /> Scanning…
                        </SyncStatus>
                      ) : (
                        format.localeShortDateAndTime(new Date(timestamp))
                      )}
                    </TD>
                    <TD narrow>
                      <Actions>
                        <Button
                          icon="Delete"
                          fill="transparent"
                          // color="danger"
                          onPress={() => setPendingDeleteBatch(batch)}
                          style={{ flexWrap: 'nowrap' }}
                          disabled={isScanning}
                        >
                          Delete
                        </Button>
                      </Actions>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </BatchTableCard>
        )}
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
