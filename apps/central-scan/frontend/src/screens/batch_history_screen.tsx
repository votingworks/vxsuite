import React, { useState } from 'react';
import {
  Button,
  Callout,
  Icons,
  Loading,
  Modal,
  P,
  ScrollTable,
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

const BatchTable = styled(ScrollTable)`
  flex: 1;

  ${ScrollTable.Cell} {
    padding: 0.25rem 0.75rem;
  }

  button {
    padding: 0.5rem 0.75rem;
  }
`;

const TextWithIcon = styled.div`
  display: flex;
  align-items: center;
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
        <div style={{ display: 'flex', gap: '1rem' }}>
          <BatchSummaryStats status={status} />
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
          >
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
              fill="tinted"
              disabled={batches.length === 0 || isScanning}
              onPress={() => setDeleteBallotDataFlowState('confirmation')}
            >
              Delete All Batches
            </Button>
          </div>
        </div>
        {isNetworkingEnabled && networkStatus && (
          <SendingPausedCallout connection={networkStatus.connection} />
        )}
        {batches.length > 0 && (
          <BatchTable>
            <ScrollTable.Header>
              <ScrollTable.Column>Batch</ScrollTable.Column>
              <ScrollTable.Column>Sheets</ScrollTable.Column>
              <ScrollTable.Column>Scanned At</ScrollTable.Column>
              {isNetworkingEnabled && (
                <ScrollTable.Column>VxAdmin&nbsp;Sync</ScrollTable.Column>
              )}
              <ScrollTable.Column width="min-content">
                &nbsp;
              </ScrollTable.Column>
            </ScrollTable.Header>
            <ScrollTable.Body>
              {batches.map((batch) => {
                const sendState = getBatchSendState(batch);
                return (
                  <ScrollTable.Row key={batch.id}>
                    <ScrollTable.Cell>{batch.label}</ScrollTable.Cell>
                    <ScrollTable.Cell>
                      {format.count(batch.count)}
                    </ScrollTable.Cell>
                    <ScrollTable.Cell>
                      {isScanning && !batch.endedAt ? (
                        <TextWithIcon>
                          <Icons.Loading /> Scanning…
                        </TextWithIcon>
                      ) : (
                        batch.endedAt &&
                        format.localeShortDateAndTime(new Date(batch.endedAt))
                      )}
                    </ScrollTable.Cell>
                    {isNetworkingEnabled && (
                      <ScrollTable.Cell>
                        <TextWithIcon style={{ width: '6.5rem' }}>
                          {sendState.icon}
                          {sendState.label}
                        </TextWithIcon>
                        {sendState.action === 'retry' && (
                          <Button
                            icon="Redo"
                            fill="outlined"
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
                            fill="outlined"
                            onPress={() =>
                              resendMutation.mutate({ batchId: batch.id })
                            }
                            disabled={resendMutation.isLoading}
                          >
                            Resend
                          </Button>
                        )}
                      </ScrollTable.Cell>
                    )}
                    <ScrollTable.Cell>
                      <Button
                        icon="Delete"
                        fill="transparent"
                        onPress={() => setPendingDeleteBatch(batch)}
                        disabled={isScanning}
                      >
                        Delete
                      </Button>
                    </ScrollTable.Cell>
                  </ScrollTable.Row>
                );
              })}
            </ScrollTable.Body>
          </BatchTable>
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
