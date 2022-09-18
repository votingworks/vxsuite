import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import { Scan } from '@votingworks/api';

import { Modal, Text } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import { Prose } from '../components/prose';
import { Table, TD } from '../components/table';
import { Button } from '../components/button';

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
  deleteBatch(batchId: string): Promise<void>;
}

export function DashboardScreen({
  isScanning,
  status,
  deleteBatch,
}: Props): JSX.Element {
  const { batches } = status;
  const batchCount = batches.length;
  const ballotCount = batches.reduce((result, b) => result + b.count, 0);

  const [pendingDeleteBatch, setPendingDeleteBatchId] =
    useState<Scan.BatchInfo>();
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [deleteBatchError, setDeleteBatchError] = useState<string>();

  const confirmDeleteBatch = useCallback(() => {
    setIsDeletingBatch(true);
  }, []);

  const cancelDeleteBatch = useCallback(() => {
    setPendingDeleteBatchId(undefined);
    setDeleteBatchError(undefined);
  }, []);

  const onDeleteBatchSucceeded = useCallback(() => {
    setIsDeletingBatch(false);
    setPendingDeleteBatchId(undefined);
  }, []);

  const onDeleteBatchFailed = useCallback((error: Error) => {
    setIsDeletingBatch(false);
    setDeleteBatchError(error.message);
  }, []);

  useEffect(() => {
    if (pendingDeleteBatch && isDeletingBatch) {
      let isMounted = true;
      void (async () => {
        try {
          await deleteBatch(pendingDeleteBatch.id);

          if (isMounted) {
            onDeleteBatchSucceeded();
          }
        } catch (error) {
          assert(error instanceof Error);
          if (isMounted) {
            onDeleteBatchFailed(error);
          }
        }
      })();
      return () => {
        isMounted = false;
      };
    }
  }, [
    pendingDeleteBatch,
    isDeletingBatch,
    deleteBatch,
    onDeleteBatchSucceeded,
    onDeleteBatchFailed,
  ]);

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
                        onPress={() => setPendingDeleteBatchId(batch)}
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
        <Modal
          centerContent
          onOverlayClick={isDeletingBatch ? undefined : cancelDeleteBatch}
          content={
            <Prose textCenter>
              <h1>Delete ‘{pendingDeleteBatch.label}’?</h1>
              <p>This action cannot be undone.</p>
              {deleteBatchError && <Text error>{deleteBatchError}</Text>}
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={confirmDeleteBatch}
                disabled={isDeletingBatch}
                autoFocus
              >
                {isDeletingBatch ? 'Deleting…' : 'Yes, Delete Batch'}
              </Button>
              <Button onPress={cancelDeleteBatch} disabled={isDeletingBatch}>
                Cancel
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
