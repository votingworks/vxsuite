import React, { useState } from 'react';
import pluralize from 'pluralize';
import { Scan } from '@votingworks/api';
import {
  Button,
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
import { DeleteBatchModal } from '../components/delete_batch_modal';
import { NavigationScreen } from '../navigation_screen';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScanButton } from '../components/scan_button';
import { clearBallotData } from '../api';

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

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const DeleteAllWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export interface ScanBallotsScreenProps {
  isScannerAttached: boolean;
  isScanning: boolean;
  isExportingCvrs: boolean;
  setIsExportingCvrs: (isExportingCvrs: boolean) => void;
  scanBatch: () => void;
  status: Scan.GetScanStatusResponse;
}

export function ScanBallotsScreen({
  isScannerAttached,
  isScanning,
  isExportingCvrs,
  setIsExportingCvrs,
  scanBatch,
  status,
}: ScanBallotsScreenProps): JSX.Element {
  const { batches } = status;
  const batchCount = batches.length;
  const ballotCount = batches.reduce((result, b) => result + b.count, 0);

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
  if (status.adjudication.remaining > 0) {
    exportButtonTitle =
      'You cannot save results until all ballots have been adjudicated.';
  } else if (status.batches.length === 0) {
    exportButtonTitle =
      'You cannot save results until you have scanned at least 1 ballot.';
  }

  return (
    <NavigationScreen title="Scan Ballots">
      <Content>
        <Actions>
          <ScanButton
            onPress={scanBatch}
            disabled={isScanning}
            isScannerAttached={isScannerAttached}
          />
          <Button
            onPress={() => setIsExportingCvrs(true)}
            disabled={
              status.adjudication.remaining > 0 || status.batches.length === 0
            }
            nonAccessibleTitle={exportButtonTitle}
            icon="Export"
            color="primary"
          >
            Save CVRs
          </Button>
        </Actions>
        {batchCount ? (
          <React.Fragment>
            <div>
              <P>
                A total of{' '}
                <Font weight="bold">
                  {pluralize('ballot', ballotCount, true)}
                </Font>{' '}
                {ballotCount === 1 ? 'has' : 'have'} been scanned in{' '}
                <Font weight="bold">
                  {pluralize('batch', batchCount, true)}
                </Font>
                .
              </P>
              <Table>
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Ballot Count</th>
                    <th>Started At</th>
                    <th>Finished At</th>
                    <th>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.label}</td>
                      <td>{batch.count}</td>
                      <TD nowrap>{shortDateTime(batch.startedAt)}</TD>
                      <TD nowrap>
                        {isScanning && !batch.endedAt ? (
                          <Font weight="bold">
                            <Icons.Loading /> Scanning…
                          </Font>
                        ) : batch.endedAt ? (
                          shortDateTime(batch.endedAt)
                        ) : null}
                      </TD>
                      <TD narrow>
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
                disabled={isScanning || !status.canUnconfigure}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete All Batches
              </Button>
            </DeleteAllWrapper>
          </React.Fragment>
        ) : (
          <P>
            <Icons.Info /> No ballots have been scanned
          </P>
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
      {deleteBallotDataFlowState === 'confirmation' && (
        <Modal
          title="Delete All Scanned Batches?"
          content={<P>This will permanently delete all scanned ballot data.</P>}
          actions={
            <React.Fragment>
              <Button variant="danger" icon="Delete" onPress={deleteBallotData}>
                Yes, Delete All Batches
              </Button>
              <Button onPress={resetDeleteBallotDataFlow}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={resetDeleteBallotDataFlow}
        />
      )}
      {deleteBallotDataFlowState === 'deleting' && (
        <Modal
          centerContent
          content={<Loading>Deleting ballot data</Loading>}
        />
      )}
    </NavigationScreen>
  );
}
