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
import { DeleteBatchModal } from '../components/delete_batch_modal.js';
import { NavigationScreen } from '../navigation_screen.js';
import { ExportResultsModal } from '../components/export_results_modal.js';
import { ScanButton } from '../components/scan_button.js';
import { clearBallotData, getNetworkStatus } from '../api.js';

pluralize.addIrregularRule('requires', 'require');
pluralize.addIrregularRule('has', 'have');

function z2(number: number) {
  return number.toString().padStart(2, '0');
}

function shortDateTime(iso8601Timestamp: string) {
  const d = new Date(iso8601Timestamp);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(
    d.getDate()
  )} ${d.getHours()}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}

// Reserves enough width for a full timestamp so the column doesn't resize
// when a batch flips from "Not sent" to its sent time.
const SentAtCell = styled(TD)`
  min-width: 12rem;
`;

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
  const isScanning = !!status.ongoingBatchId;
  const { batches } = status;
  const batchCount = batches.length;

  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<BatchInfo>();
  const networkStatusQuery = getNetworkStatus.usePollingQuery();
  const isNetworkingEnabled = networkStatusQuery.data?.isEnabled ?? false;
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
  // @coverage-defer
  if (status.adjudicationsRemaining > 0) {
    exportButtonTitle =
      'You cannot save results until all sheets have been adjudicated.';
  } else if (status.batches.length === 0) {
    exportButtonTitle =
      'You cannot save results until you have scanned at least one sheet.';
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
        <TopBar>
          {batchCount ? (
            <TopBarStats color="neutral" style={{ gap: '3rem' }}>
              <P>
                <Font weight="bold">Total Batches:</Font>{' '}
                {format.count(batchCount)}
              </P>
              <P>
                <Font weight="bold">Total Sheets:</Font>{' '}
                {format.count(ballotCount)}
              </P>
            </TopBarStats>
          ) : (
            <P>
              <Icons.Info /> No ballots have been scanned
            </P>
          )}
          <TopBarActions>
            <Button
              onPress={() => setIsExportingCvrs(true)}
              disabled={
                status.adjudicationsRemaining > 0 || status.batches.length === 0
              }
              nonAccessibleTitle={exportButtonTitle}
              icon="Export"
              color="primary"
            >
              Save CVRs
            </Button>
            <ScanButton
              /* disable scan button while status query is refetching to avoid double clicks */
              disabled={
                isScanning || statusIsStale || isPollingPlaceUnconfigured
              }
              isScannerAttached={status.isScannerAttached}
            />
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
                    {isNetworkingEnabled && <th>Sent At</th>}
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
                        {/* @coverage-defer */}
                        {isScanning && !batch.endedAt ? (
                          <Font weight="bold">
                            <Icons.Loading /> Scanning…
                          </Font>
                        ) : batch.endedAt ? (
                          shortDateTime(batch.endedAt)
                        ) : null}
                      </TD>
                      {isNetworkingEnabled && (
                        <SentAtCell nowrap>
                          {batch.sentToAdminAt ? (
                            shortDateTime(batch.sentToAdminAt)
                          ) : (
                            <Font weight="light">Not sent</Font>
                          )}
                        </SentAtCell>
                      )}
                      <TD narrow>
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
