import React, { useState } from 'react';
import styled from 'styled-components';
import { Button, Font, Icons, Modal, P } from '@votingworks/ui';
import type {
  BatchPauseReason,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { cancelBatch, continueBatch, saveBatch } from '../api';
import { ScanButton } from './scan_button';

const Card = styled.div`
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const CardStatus = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const SheetCount = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const BigCount = styled.span`
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
`;

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
`;

const PAUSE_REASON_TEXT: Record<BatchPauseReason, string> = {
  'tray-empty': 'input tray is empty',
  stopped: 'scanning stopped',
  'ballot-review': 'a ballot required review',
};

export interface BatchControlCardProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
}

export function BatchControlCard({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
}: BatchControlCardProps): JSX.Element {
  const continueBatchMutation = continueBatch.useMutation();
  const saveBatchMutation = saveBatch.useMutation();
  const cancelBatchMutation = cancelBatch.useMutation();
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isShowingBatchCanceledInfo, setIsShowingBatchCanceledInfo] =
    useState(false);

  const { currentBatch } = status;
  const batch = status.batches.find((b) => b.id === currentBatch?.batchId);
  const sheetCount = batch?.count ?? 0;

  // Stopping a scanning batch means something went wrong with the batch as
  // scanned, so it discards the batch immediately and informs the operator
  // afterward.
  function stopAndCancelBatch() {
    cancelBatchMutation.mutate(undefined, {
      onSuccess: () => setIsShowingBatchCanceledInfo(true),
    });
  }

  const isActing =
    continueBatchMutation.isLoading ||
    saveBatchMutation.isLoading ||
    cancelBatchMutation.isLoading;

  let content: JSX.Element;
  if (!currentBatch) {
    content = (
      <React.Fragment>
        <CardStatus>
          <P>
            <Font weight="bold">
              <Icons.Info /> Ready to scan
            </Font>
          </P>
          <P>No batch in progress</P>
        </CardStatus>
        <CardActions>
          <ScanButton
            /* disable scan button while status query is refetching to avoid double clicks */
            disabled={statusIsStale || isPollingPlaceUnconfigured}
            isScannerAttached={status.isScannerAttached}
          />
        </CardActions>
      </React.Fragment>
    );
  } else if (currentBatch.state === 'scanning') {
    content = (
      <React.Fragment>
        <CardStatus>
          <P>
            <Font weight="bold">
              <Icons.Loading /> Scanning batch
            </Font>
          </P>
          <SheetCount>
            <BigCount>{format.count(sheetCount)}</BigCount>{' '}
            <span>sheets scanned in this batch</span>
          </SheetCount>
        </CardStatus>
        <CardActions>
          <Button
            variant="danger"
            onPress={stopAndCancelBatch}
            disabled={cancelBatchMutation.isLoading}
          >
            Stop
          </Button>
        </CardActions>
      </React.Fragment>
    );
  } else {
    const pauseReasonText = currentBatch.pauseReason
      ? ` — ${PAUSE_REASON_TEXT[currentBatch.pauseReason]}`
      : '';
    content = (
      <React.Fragment>
        <CardStatus>
          <P>
            <Font weight="bold">
              <Icons.Warning color="warning" /> Batch paused
              {pauseReasonText}
            </Font>
          </P>
          <SheetCount>
            <BigCount>{format.count(sheetCount)}</BigCount>{' '}
            <span>sheets scanned in this batch</span>
          </SheetCount>
        </CardStatus>
        <CardActions>
          <Button
            variant="primary"
            onPress={() => continueBatchMutation.mutate()}
            disabled={isActing || statusIsStale}
          >
            Continue Scanning
          </Button>
          <Button
            onPress={() => saveBatchMutation.mutate()}
            disabled={isActing}
          >
            Save Batch
          </Button>
          <Button
            color="danger"
            fill="outlined"
            onPress={() => setIsConfirmingCancel(true)}
            disabled={isActing}
          >
            Cancel
          </Button>
        </CardActions>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Card>{content}</Card>
      {isConfirmingCancel && (
        <Modal
          title="Cancel Batch"
          content={
            <P>
              All {format.count(sheetCount)} sheets scanned in this batch will
              be permanently deleted.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Delete"
                onPress={() =>
                  cancelBatchMutation.mutate(undefined, {
                    onSuccess: () => setIsConfirmingCancel(false),
                  })
                }
                disabled={cancelBatchMutation.isLoading}
              >
                Cancel Batch
              </Button>
              <Button onPress={() => setIsConfirmingCancel(false)}>
                Close
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setIsConfirmingCancel(false)}
        />
      )}
      {isShowingBatchCanceledInfo && (
        <Modal
          title="Batch Canceled"
          content={
            <P>
              Scanning was stopped and all sheets scanned in this batch were
              discarded. Remove the sheets from the scanner&apos;s output tray
              before scanning a new batch.
            </P>
          }
          actions={
            <Button onPress={() => setIsShowingBatchCanceledInfo(false)}>
              Close
            </Button>
          }
          onOverlayClick={() => setIsShowingBatchCanceledInfo(false)}
        />
      )}
    </React.Fragment>
  );
}
