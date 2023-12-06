import React, { useState } from 'react';
import pluralize from 'pluralize';
import { Scan } from '@votingworks/api';
import { Button, Font, Icons, P, TD, Table } from '@votingworks/ui';
import { BatchInfo } from '@votingworks/types';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import { DeleteBatchModal } from '../components/delete_batch_modal';
import { NavigationScreen } from '../navigation_screen';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScanButton } from '../components/scan_button';

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

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
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
  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<BatchInfo>();
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
      <div>
        {batchCount ? (
          <React.Fragment>
            <P>
              A total of{' '}
              <Font weight="bold">
                {pluralize('ballot', ballotCount, true)}
              </Font>{' '}
              {ballotCount === 1 ? 'has' : 'have'} been scanned in{' '}
              <Font weight="bold">{pluralize('batch', batchCount, true)}</Font>.
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
          </React.Fragment>
        ) : (
          <P>
            <Icons.Info /> No ballots have been scanned
          </P>
        )}
      </div>
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
    </NavigationScreen>
  );
}
