import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { Button, H2, Modal, P } from '@votingworks/ui';
import type {
  BatchPauseReason,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { cancelBatch, continueBatch, saveBatch } from '../api';
import { ScanButton } from './scan_button';

const Card = styled.div`
  display: flex;
  align-items: stretch;
  height: 100%;
`;

const StatusPane = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  padding: 2rem;
  width: 26rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  h2 {
    margin-bottom: 0;
  }

  p {
    margin-bottom: 0;
  }
`;

const ActionsPane = styled.div`
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1rem;
  flex-grow: 1;

  button {
    font-size: 1.4rem;
    padding: 0.75rem 2rem;
  }
`;

const ActionsFooter = styled.div`
  margin-top: auto;
`;

const PageWrapper = styled.div`
  position: relative;
  width: 12rem;
  margin: 0 auto;
`;

const PageCount = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  font-weight: 700;
`;

const PageCaption = styled.p`
  text-align: center;
`;

/**
 * A page with a folded top-right corner, standing in for the batch being
 * scanned — the batch-control equivalent of the smart card illustration on
 * VxAdmin's card programming screen. Dashed while there is no batch in
 * progress.
 */
function PageIllustration({
  dashed,
  active,
  children,
}: {
  dashed?: boolean;
  active?: boolean;
  children?: React.ReactNode;
}): JSX.Element {
  const theme = useTheme();
  let stroke = theme.colors.onBackground;
  if (dashed) {
    stroke = theme.colors.outline;
  } else if (active) {
    stroke = theme.colors.primary;
  }
  return (
    <PageWrapper>
      <svg viewBox="0 0 120 156" role="img" aria-hidden="true">
        <path
          d="M6 6 H84 L114 36 V150 H6 Z"
          fill={dashed ? 'none' : theme.colors.background}
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '10 8' : undefined}
        />
        <path
          d="M84 6 V36 H114"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '10 8' : undefined}
        />
      </svg>
      <PageCount>{children}</PageCount>
    </PageWrapper>
  );
}

const PAUSE_REASON_TEXT: Record<BatchPauseReason, string> = {
  'tray-empty': 'Input tray empty',
  stopped: 'Scanning stopped',
  'ballot-review': 'A ballot required review',
  error: 'A scanning error occurred',
};

export interface BatchControlCardProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
  /** Notice (e.g. a warning callout) shown above the action buttons. */
  notice?: React.ReactNode;
  /** Content (e.g. batch stats) pinned to the bottom of the actions pane. */
  actionsFooter?: React.ReactNode;
}

export function BatchControlCard({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
  notice,
  actionsFooter,
}: BatchControlCardProps): JSX.Element {
  const continueBatchMutation = continueBatch.useMutation();
  const saveBatchMutation = saveBatch.useMutation();
  const cancelBatchMutation = cancelBatch.useMutation();
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isShowingBatchCanceledInfo, setIsShowingBatchCanceledInfo] =
    useState(false);

  const { currentBatch } = status;
  const batch = status.batches.find((b) => b.id === currentBatch?.batchId);
  const sheetCount = batch?.count ?? 0;

  // Stopping a scanning batch means something went wrong with the batch as
  // scanned, so it discards the batch and informs the operator afterward.
  function stopAndCancelBatch() {
    cancelBatchMutation.mutate(undefined, {
      onSuccess: () => {
        setIsConfirmingStop(false);
        setIsShowingBatchCanceledInfo(true);
      },
    });
  }

  const isActing =
    continueBatchMutation.isLoading ||
    saveBatchMutation.isLoading ||
    cancelBatchMutation.isLoading;

  let statusContent: JSX.Element;
  let actions: JSX.Element;
  if (!currentBatch) {
    statusContent = (
      <React.Fragment>
        <div>
          <H2>Ready to Scan</H2>
          <P>{' '}</P>
        </div>
        <PageIllustration dashed />
      </React.Fragment>
    );
    actions = (
      <ScanButton
        /* disable scan button while status query is refetching to avoid double clicks */
        disabled={statusIsStale || isPollingPlaceUnconfigured}
        isScannerAttached={status.isScannerAttached}
        label={`Start Batch ${format.count(status.nextBatchNumber)}`}
      />
    );
  } else if (currentBatch.state === 'scanning') {
    statusContent = (
      <React.Fragment>
        <div>
          <H2>Scanning</H2>
          <P>{' '}</P>
        </div>
        <PageIllustration active>{format.count(sheetCount)}</PageIllustration>
        <PageCaption>sheets scanned in this batch</PageCaption>
      </React.Fragment>
    );
    actions = (
      <Button
        variant="danger"
        onPress={() => setIsConfirmingStop(true)}
        disabled={cancelBatchMutation.isLoading}
      >
        Stop
      </Button>
    );
  } else {
    statusContent = (
      <React.Fragment>
        <div>
          <H2>Paused</H2>
          <P>
            {currentBatch.pauseReason
              ? PAUSE_REASON_TEXT[currentBatch.pauseReason]
              : ' '}
          </P>
        </div>
        <PageIllustration>{format.count(sheetCount)}</PageIllustration>
        <PageCaption>sheets scanned in this batch</PageCaption>
      </React.Fragment>
    );
    actions = (
      <React.Fragment>
        <Button
          variant="primary"
          onPress={() => continueBatchMutation.mutate()}
          disabled={isActing || statusIsStale}
        >
          Continue Scanning
        </Button>
        <Button onPress={() => setIsConfirmingSave(true)} disabled={isActing}>
          Save Batch
        </Button>
        <Button
          color="danger"
          fill="outlined"
          onPress={() => setIsConfirmingCancel(true)}
          disabled={isActing}
        >
          Discard Batch
        </Button>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Card>
        <StatusPane>{statusContent}</StatusPane>
        <ActionsPane>
          {batch && <H2>{batch.label}</H2>}
          {notice}
          {actions}
          {actionsFooter && <ActionsFooter>{actionsFooter}</ActionsFooter>}
        </ActionsPane>
      </Card>
      {isConfirmingSave && (
        <Modal
          title="Save Batch"
          content={
            <P>
              All {format.count(sheetCount)} sheets scanned in this batch will
              be saved and sent to VxAdmin.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                icon="Done"
                onPress={() =>
                  saveBatchMutation.mutate(undefined, {
                    onSuccess: () => setIsConfirmingSave(false),
                  })
                }
                disabled={saveBatchMutation.isLoading}
              >
                Save Batch
              </Button>
              <Button onPress={() => setIsConfirmingSave(false)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setIsConfirmingSave(false)}
        />
      )}
      {isConfirmingStop && (
        <Modal
          title="Stop Scanning"
          content={
            <P>
              Scanning will be stopped and all {format.count(sheetCount)} sheets
              scanned in this batch will be discarded.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Delete"
                onPress={stopAndCancelBatch}
                disabled={cancelBatchMutation.isLoading}
              >
                Stop and Discard
              </Button>
              <Button onPress={() => setIsConfirmingStop(false)}>Close</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setIsConfirmingStop(false)}
        />
      )}
      {isConfirmingCancel && (
        <Modal
          title="Discard Batch"
          content={
            <P>
              All {format.count(sheetCount)} sheets scanned in this batch will
              be permanently discarded.
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
                Discard Batch
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
          title="Batch Discarded"
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
