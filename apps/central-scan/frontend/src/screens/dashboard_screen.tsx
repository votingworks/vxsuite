import React, { useState } from 'react';
import pluralize from 'pluralize';

import { Scan } from '@votingworks/api';

import { Button, Font, H1, Icons, P, TD, Table } from '@votingworks/ui';
import { BatchInfo } from '@votingworks/types';
import { DeleteBatchModal } from '../components/delete_batch_modal';

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

interface Props {
  isScanning: boolean;
  status: Scan.GetScanStatusResponse;
}

export function DashboardScreen({ isScanning, status }: Props): JSX.Element {
  const { batches } = status;
  const batchCount = batches.length;
  const ballotCount = batches.reduce((result, b) => result + b.count, 0);

  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<BatchInfo>();

  return (
    <React.Fragment>
      <H1>Scanned Ballot Batches</H1>
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
                        <Font color="success" weight="bold">
                          <Icons.Loading /> Scanning…
                        </Font>
                      ) : batch.endedAt ? (
                        shortDateTime(batch.endedAt)
                      ) : null}
                    </TD>
                    <TD narrow>
                      <Button onPress={() => setPendingDeleteBatch(batch)}>
                        Delete
                      </Button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </React.Fragment>
        ) : (
          <P>No ballots have been scanned.</P>
        )}
      </div>
      {pendingDeleteBatch && (
        <DeleteBatchModal
          batchId={pendingDeleteBatch.id}
          batchLabel={pendingDeleteBatch.label}
          onClose={() => setPendingDeleteBatch(undefined)}
        />
      )}
    </React.Fragment>
  );
}
