import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { Button, Font, Icons, Modal, P } from '@votingworks/ui';
import type {
  BatchPauseReason,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { cancelBatch, continueBatch, saveBatch } from '../api';
import { ScanButton } from './scan_button';

const Card = styled.div<{ large?: boolean; minimized?: boolean }>`
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  ${(p) =>
    p.large &&
    css`
      flex-direction: column;
      justify-content: center;
      padding: ${p.minimized ? '1rem' : '2.5rem 2rem'};
      gap: ${p.minimized ? '0.75rem' : '2rem'};

      /* Keep a constant footprint across the ready/scanning/paused states so
       * the controls don't jump around as scanning starts and stops. */
      min-height: ${p.minimized ? '0' : '19rem'};
      transition:
        min-height 0.3s ease,
        padding 0.3s ease,
        gap 0.3s ease;
    `}
`;

const CardStatus = styled.div<{ large?: boolean; minimized?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  ${(p) =>
    p.large &&
    css`
      align-items: center;
      gap: ${p.minimized ? '0.25rem' : '1rem'};

      p {
        font-size: ${p.minimized ? '1rem' : '1.5rem'};
        transition: font-size 0.3s ease;
      }
    `}
`;

const SheetCount = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const BigCount = styled.span<{ large?: boolean; minimized?: boolean }>`
  font-size: ${(p) => (p.large && !p.minimized ? '5rem' : '2.5rem')};
  font-weight: 700;
  line-height: 1;
  transition: font-size 0.3s ease;
`;

const CardActions = styled.div<{ large?: boolean; minimized?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;

  ${(p) =>
    p.large &&
    css`
      justify-content: center;
      gap: ${p.minimized ? '0.5rem' : '1rem'};

      button {
        font-size: ${p.minimized ? '1rem' : '1.4rem'};
        padding: ${p.minimized ? '0.5rem 1.25rem' : '0.75rem 2rem'};
        transition:
          font-size 0.3s ease,
          padding 0.3s ease;
      }
    `}
`;

const PAUSE_REASON_TEXT: Record<BatchPauseReason, string> = {
  'tray-empty': 'input tray is empty',
  stopped: 'scanning stopped',
  'ballot-review': 'a ballot required review',
  error: 'a scanning error occurred',
};

export interface BatchControlCardProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
  /** Renders a larger version of the card for the poll worker screen. */
  large?: boolean;
  /**
   * Shrinks the large card (with an animated transition) while keeping its
   * layout, e.g. while the batch history is open. Only applies with `large`.
   */
  minimized?: boolean;
}

export function BatchControlCard({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
  large,
  minimized,
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
        <CardStatus large={large} minimized={minimized}>
          <P>
            <Font weight="bold">
              <Icons.Info /> Ready to scan
            </Font>
          </P>
          <P>No batch in progress</P>
        </CardStatus>
        <CardActions large={large} minimized={minimized}>
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
        <CardStatus large={large} minimized={minimized}>
          <P>
            <Font weight="bold">
              <Icons.Loading /> Scanning batch
            </Font>
          </P>
          <SheetCount>
            <BigCount large={large} minimized={minimized}>
              {format.count(sheetCount)}
            </BigCount>{' '}
            <span>sheets scanned in this batch</span>
          </SheetCount>
        </CardStatus>
        <CardActions large={large} minimized={minimized}>
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
        <CardStatus large={large} minimized={minimized}>
          <P>
            <Font weight="bold">
              <Icons.Warning color="warning" /> Batch paused
              {pauseReasonText}
            </Font>
          </P>
          <SheetCount>
            <BigCount large={large} minimized={minimized}>
              {format.count(sheetCount)}
            </BigCount>{' '}
            <span>sheets scanned in this batch</span>
          </SheetCount>
        </CardStatus>
        <CardActions large={large} minimized={minimized}>
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
      <Card large={large} minimized={minimized}>
        {content}
      </Card>
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
