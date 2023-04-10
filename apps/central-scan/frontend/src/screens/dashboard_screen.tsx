import React, { useState } from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import { Scan } from '@votingworks/api';

import { Button } from '@votingworks/ui';
import { BatchInfo } from '@votingworks/types';
import { Prose } from '../components/prose';
import { Table, TD } from '../components/table';
import { DeleteBatchModal } from '../components/delete_batch_modal';

pluralize.addIrregularRule('requires', 'require');
pluralize.addIrregularRule('has', 'have');

const Scanning = styled.em`
  color: rgb(71, 167, 75);
`;

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
      <Prose maxWidth={false}>
        <h1>Scanned Ballot Batches</h1>
        {batchCount ? (
          <React.Fragment>
            <p>
              {ballotCount === 1 ? (
                <React.Fragment>
                  A total of <strong>1 ballot</strong> has been scanned in{' '}
                  <strong>{pluralize('batch', batchCount, true)}</strong>.
                </React.Fragment>
              ) : (
                <React.Fragment>
                  A total of{' '}
                  <strong>{pluralize('ballot', ballotCount, true)}</strong> have
                  been scanned in{' '}
                  <strong>{pluralize('batch', batchCount, true)}</strong>.
                </React.Fragment>
              )}
            </p>
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
                    <TD nowrap>
                      <small>{shortDateTime(batch.startedAt)}</small>
                    </TD>
                    <TD nowrap>
                      {isScanning && !batch.endedAt ? (
                        <Scanning>Scanning…</Scanning>
                      ) : batch.endedAt ? (
                        <small>{shortDateTime(batch.endedAt)}</small>
                      ) : null}
                    </TD>
                    <TD narrow>
                      <Button
                        small
                        onPress={() => setPendingDeleteBatch(batch)}
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
          <p>No ballots have been scanned.</p>
        )}
      </Prose>
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
