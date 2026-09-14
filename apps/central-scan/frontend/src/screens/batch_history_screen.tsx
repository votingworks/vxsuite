import React, { useState } from 'react';
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
import type {
  NetworkConnectionInfo,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { DeleteBatchModal } from '../components/delete_batch_modal.js';
import { NavigationScreen } from '../navigation_screen.js';
import { ExportResultsModal } from '../components/export_results_modal.js';
import {
  clearBallotData,
  getNetworkStatus,
  resendBatchToAdmin,
  retrySendBatchToAdmin,
} from '../api.js';

function z2(number: number) {
  return number.toString().padStart(2, '0');
}

function shortDateTime(iso8601Timestamp: string) {
  const d = new Date(iso8601Timestamp);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(
    d.getDate()
  )} ${d.getHours()}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}

// Wide enough for a full timestamp on one line so the column doesn't resize
// when a batch flips from "Not sent" to its sent time; longer status text
// wraps rather than widening the table.
const SentAtCell = styled(TD)`
  width: 10rem;
  white-space: normal;
`;

const Timestamp = styled.span`
  white-space: nowrap;
`;

// Always wide enough for a send action (Retry/Resend) beside Delete, so the
// column doesn't resize when one appears.
const ActionsCell = styled(TD)`
  min-width: 12.25rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

const DeleteAllWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
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
          VxAdmin ({connection.hostMachineId}) has marked its results official
          and is not accepting batches. Batches will not be sent to VxAdmin.
        </Callout>
      );
    case 'online-invalid-mode':
      return (
        <Callout color="warning" icon="Warning">
          VxAdmin ({connection.hostMachineId}) is tabulating{' '}
          {connection.hostCvrFileMode} results, but this machine is in{' '}
          {connection.hostCvrFileMode === 'official' ? 'test' : 'official'}{' '}
          ballot mode. Batches will not be sent to VxAdmin until the modes
          match.
        </Callout>
      );
    default:
      return null;
  }
}

interface BatchSendState {
  /** What the "Sent At" cell shows. */
  contents: JSX.Element;
  /** An operator action offered beside Delete, if any. */
  action?: 'retry' | 'resend';
}

function getBatchSendState(batch: BatchInfo): BatchSendState {
  if (batch.sentToAdminAt) {
    if (batch.removedFromAdminAt) {
      return {
        contents: (
          <React.Fragment>
            <Icons.Warning color="warning" /> Removed from VxAdmin
          </React.Fragment>
        ),
        action: 'resend',
      };
    }
    return {
      contents: <Timestamp>{shortDateTime(batch.sentToAdminAt)}</Timestamp>,
    };
  }
  if (batch.sendToAdminError) {
    return {
      contents: (
        <React.Fragment>
          <Icons.Danger color="danger" /> Send failed
        </React.Fragment>
      ),
      action: 'retry',
    };
  }
  // Covers the attempt in flight and any wait to retry after a transient
  // failure, so the cell doesn't flicker between attempts.
  if (batch.isSendingToAdmin) {
    return {
      contents: (
        <Font weight="bold">
          <Icons.Loading /> Sending…
        </Font>
      ),
    };
  }
  return { contents: <Font weight="light">Not sent</Font> };
}

export function BatchHistoryScreen({
  status,
}: BatchHistoryScreenProps): JSX.Element {
  const { batches, state } = status;
  const isScanning = state === 'scanning';
  const batchCount = batches.length;

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
        {isNetworkingEnabled && networkStatus && (
          <SendingPausedCallout connection={networkStatus.connection} />
        )}
        <TopBar>
          <Button
            onPress={() => setIsExportingCvrs(true)}
            disabled={status.batches.length === 0}
            icon="Export"
            color="primary"
          >
            Save CVRs
          </Button>
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
                    {isNetworkingEnabled && <th>Sent At</th>}
                    <th>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const sendState = isNetworkingEnabled
                      ? getBatchSendState(batch)
                      : undefined;
                    return (
                      <tr key={batch.id}>
                        <TD nowrap>{batch.label}</TD>
                        <td>{format.count(batch.count)}</td>
                        <TD nowrap>{shortDateTime(batch.startedAt)}</TD>
                        <TD nowrap>
                          {/* @coverage-defer */}
                          {isScanning && !batch.endedAt ? (
                            <Font weight="bold">
                              <Icons.Loading /> Scanning…
                            </Font>
                          ) : batch.endedAt ? (
                            shortDateTime(batch.endedAt)
                          ) : null}
                        </TD>
                        {sendState && (
                          <SentAtCell>{sendState.contents}</SentAtCell>
                        )}
                        <ActionsCell narrow>
                          <Actions>
                            {sendState?.action === 'retry' && (
                              <Button
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
                            {sendState?.action === 'resend' && (
                              <Button
                                onPress={() =>
                                  resendMutation.mutate({ batchId: batch.id })
                                }
                                disabled={resendMutation.isLoading}
                              >
                                Resend
                              </Button>
                            )}
                            <Button
                              icon="Delete"
                              fill="transparent"
                              color="danger"
                              // @coverage-defer
                              onPress={() => setPendingDeleteBatch(batch)}
                              style={{ flexWrap: 'nowrap' }}
                              disabled={isScanning}
                            >
                              Delete
                            </Button>
                          </Actions>
                        </ActionsCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <DeleteAllWrapper>
              <Button
                icon="Delete"
                color="danger"
                disabled={isScanning}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete All Batches
              </Button>
            </DeleteAllWrapper>
          </React.Fragment>
        ) : null}
      </Content>
      {pendingDeleteBatch && (
        // @coverage-defer
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
