import React, { useState } from 'react';
import {
  Button,
  Callout,
  DesktopPalette,
  Font,
  Icons,
  Loading,
  Modal,
  P,
  TD,
  Table,
} from '@votingworks/ui';
import { BatchInfo, UiTheme } from '@votingworks/types';
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

const HEADER_LINE_HEIGHT_REM = 1;
const HEADER_PADDING_Y_REM = 0.5;
const HEADER_CONTENT_REM = HEADER_LINE_HEIGHT_REM + 2 * HEADER_PADDING_Y_REM;

function headerHeightRem(theme: UiTheme): number {
  return HEADER_CONTENT_REM + theme.sizes.bordersRem.hairline;
}

const TableCard = styled.div`
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  border-radius: 0.5rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  background: linear-gradient(
    to bottom,
    ${(p) => p.theme.colors.container} 0,
    ${(p) => p.theme.colors.container} ${HEADER_CONTENT_REM}rem,
    ${(p) => p.theme.colors.outline} ${HEADER_CONTENT_REM}rem,
    ${(p) => p.theme.colors.outline} ${(p) => headerHeightRem(p.theme)}rem,
    ${(p) => p.theme.colors.background} ${(p) => headerHeightRem(p.theme)}rem
  );

  ::-webkit-scrollbar {
    width: 0.45rem;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
    margin-top: ${(p) => headerHeightRem(p.theme)}rem;
  }

  ::-webkit-scrollbar-thumb {
    background: ${DesktopPalette.Gray10};
    border-radius: 100vw;

    :hover {
      background: ${DesktopPalette.Gray40};
    }
  }
`;

const BatchTable = styled(Table)`
  border-collapse: separate;
  border-spacing: 0;

  td {
    padding: 0.25rem 1rem;
    border-bottom: none;
  }

  th {
    padding: ${HEADER_PADDING_Y_REM}rem 1rem;
    line-height: ${HEADER_LINE_HEIGHT_REM}rem;
    background-color: ${(p) => p.theme.colors.container};
    border-top: none;
    border-bottom: ${(p) =>
      `${p.theme.sizes.bordersRem.hairline}rem solid ${p.theme.colors.outline}`};
    position: sticky;
    top: 0;
    z-index: 1;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }

  tr:nth-child(even) {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

const SyncStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  icon: JSX.Element;
  label: string;
  action?: 'retry' | 'resend';
}

function getBatchSendState(batch: BatchInfo): BatchSendState {
  if (batch.sentToAdminAt) {
    if (batch.removedFromAdminAt) {
      return {
        icon: <Icons.Warning color="warning" />,
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
        {isNetworkingEnabled && networkStatus && (
          <SendingPausedCallout connection={networkStatus.connection} />
        )}
        <TopBar>
          <BatchSummaryStats status={status} />
          {batches.length > 0 && (
            <ActionsStack>
              <Button
                onPress={() => setIsExportingCvrs(true)}
                icon="Export"
                fill="tinted"
                color="primary"
              >
                Save CVRs
              </Button>
              <Button
                icon="Delete"
                color="danger"
                fill="tinted"
                disabled={isScanning}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete All Batches
              </Button>
            </ActionsStack>
          )}
        </TopBar>
        {batches.length > 0 && (
          <TableCard>
            <BatchTable>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Sheets</th>
                  <th>Scanned At</th>
                  {isNetworkingEnabled && <th>VxAdmin Sync</th>}
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
                      <TD nowrap>{batch.label}</TD>
                      <td>{format.count(batch.count)}</td>
                      <TD nowrap>
                        {isScanning && !batch.endedAt ? (
                          <Font weight="bold">
                            <Icons.Loading /> Scanning…
                          </Font>
                        ) : (
                          format.localeShortDateAndTime(new Date(timestamp))
                        )}
                      </TD>
                      {sendState && (
                        <TD>
                          <SyncStatus>
                            {sendState.icon}
                            <span>{sendState.label}</span>
                          </SyncStatus>
                        </TD>
                      )}
                      <TD narrow>
                        <Actions>
                          {sendState?.action === 'retry' && (
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
                          {sendState?.action === 'resend' && (
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
                          <Button
                            icon="Delete"
                            fill="transparent"
                            color="danger"
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
            </BatchTable>
          </TableCard>
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
