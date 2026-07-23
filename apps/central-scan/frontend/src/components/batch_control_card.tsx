import React, { useState } from 'react';
import styled from 'styled-components';
import { Button, H2, Icons, Modal, P } from '@votingworks/ui';
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
  padding: 1rem;
  width: 45%;
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
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1rem;
  flex-grow: 1;

  button {
    font-size: 1.2rem;
    padding: 0.75rem 2rem;
  }
`;

const ActionsFooter = styled.div`
  margin-top: auto;
`;

const PageWrapper = styled.div<{
  dashed?: boolean;
  active?: boolean;
}>`
  position: relative;
  flex: 1 1 0;
  min-height: 0;

  > svg {
    display: block;
    width: 100%;
    height: 100%;

    /* The outline is stroked on the sheet's edges; let it render without being
     * clipped at the SVG bounds. */
    overflow: visible;
  }

  path {
    fill: none;
    stroke: ${(p) =>
      p.active ? p.theme.colors.primary : p.theme.colors.outline};

    /* Match the smart card's border weight exactly: use the same border sizes,
     * and non-scaling-stroke so the weight stays constant as the sheet scales
     * to fill its container. */
    stroke-width: ${(p) =>
      p.active
        ? p.theme.sizes.bordersRem.medium
        : p.theme.sizes.bordersRem.thin}rem;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-dasharray: ${(p) => (p.dashed ? '0.3rem 0.25rem' : 'none')};
  }

  .sheet {
    fill: ${(p) => (p.dashed ? 'none' : p.theme.colors.background)};
  }
`;

const PageCount = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 5rem;
  font-weight: 700;
`;

const StatusTitle = styled(H2)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

/**
 * A sheet of paper with a folded-down corner, standing in for the batch being
 * scanned — the batch-control equivalent of the smart card illustration on
 * VxAdmin's card programming screen, and styled to mirror it: the outline is
 * dashed while no batch is in progress and solid once scanning, drawn in the
 * `outline` color (or a thicker `primary` stroke while a batch is active), and
 * the sheet fills in once it holds a batch. The folded corner is always drawn;
 * only its line style changes between states. The SVG scales to fill its
 * container while `non-scaling-stroke` keeps the outline the same weight as the
 * smart card's border.
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
  return (
    <PageWrapper dashed={dashed} active={active}>
      <svg
        viewBox="0 0 102 132"
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        {/* Sheet outline, with the top-right corner cut away for the fold. */}
        <path className="sheet" d="M1 1 H79 L101 23 V131 H1 Z" />
        {/* Folded-down corner: the two edges of the flap lying on the sheet. */}
        <path d="M79 1 V23 H101" />
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
  let actions: JSX.Element | null;
  if (!currentBatch && !status.isScannerAttached) {
    // No scanner is connected, so scanning isn't possible: show a disconnected
    // status and no scan button rather than a "Ready to Scan" prompt.
    statusContent = (
      <React.Fragment>
        <div>
          <StatusTitle>
            <Icons.Disabled color="danger" />
            Scanner Disconnected
          </StatusTitle>
          <P>Connect the scanner to begin scanning.</P>
        </div>
        <PageIllustration dashed />
      </React.Fragment>
    );
    actions = null;
  } else if (!currentBatch) {
    statusContent = (
      <React.Fragment>
        <div>
          <StatusTitle>Ready to Scan</StatusTitle>
          <P>Place ballots in the input tray</P>
        </div>
        <PageIllustration dashed>
          <Icons.UpCircle style={{ height: '30%' }} />
        </PageIllustration>
      </React.Fragment>
    );
    actions = (
      <ScanButton
        /* disable scan button while status query is refetching to avoid double clicks */
        disabled={statusIsStale || isPollingPlaceUnconfigured}
        label={`Start Batch ${format.count(status.nextBatchNumber)}`}
      />
    );
  } else if (currentBatch.state === 'scanning') {
    statusContent = (
      <React.Fragment>
        <div>
          <StatusTitle>
            <Icons.Loading color="primary" />
            Scanning
          </StatusTitle>
          <P>{' '}</P>
        </div>
        <PageIllustration active>{format.count(sheetCount)}</PageIllustration>
      </React.Fragment>
    );
    actions = (
      <Button
        variant="danger"
        onPress={() => setIsConfirmingStop(true)}
        disabled={cancelBatchMutation.isLoading}
        icon="Delete"
      >
        Stop Scanning
      </Button>
    );
  } else {
    statusContent = (
      <React.Fragment>
        <div>
          <StatusTitle>
            <Icons.Paused color="warning" />
            Paused
          </StatusTitle>
          <P>
            {currentBatch.pauseReason
              ? PAUSE_REASON_TEXT[currentBatch.pauseReason]
              : ' '}
          </P>
        </div>
        <PageIllustration>{format.count(sheetCount)}</PageIllustration>
      </React.Fragment>
    );
    actions = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!status.isScannerAttached && (
          <P>
            <Icons.Disabled color="danger" /> Connect the scanner to continue
            scanning.
          </P>
        )}
        <Button
          variant="primary"
          onPress={() => continueBatchMutation.mutate()}
          disabled={isActing || statusIsStale || !status.isScannerAttached}
          rightIcon="Next"
        >
          Continue Scanning
        </Button>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            color="danger"
            fill="tinted"
            onPress={() => setIsConfirmingCancel(true)}
            disabled={isActing}
            icon="Trash"
            style={{ flex: 1, minWidth: 0 }}
          >
            Discard Batch
          </Button>
          <Button
            icon="Done"
            variant="secondary"
            onPress={() => setIsConfirmingSave(true)}
            disabled={isActing}
            style={{ flex: 1, minWidth: 0 }}
          >
            Save Batch
          </Button>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <Card>
        <StatusPane>{statusContent}</StatusPane>
        <ActionsPane>
          {batch && <H2 style={{ margin: 0 }}>{batch.label}</H2>}
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
