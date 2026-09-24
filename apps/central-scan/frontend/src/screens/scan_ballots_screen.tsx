import React, { useState } from 'react';
import styled from 'styled-components';
import { Button, Callout, H2, Icons, Modal, P } from '@votingworks/ui';
import type {
  BatchPauseReason,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { throwIllegalValue } from '@votingworks/basics';
import { NavigationScreen } from '../navigation_screen.js';
import { BatchSummaryStats } from '../components/batch_summary_stats.js';
import {
  discardBatch,
  getNetworkStatus,
  pauseBatch,
  resumeBatch,
  saveBatch,
  scanBatch,
} from '../api.js';

const Container = styled.div`
  display: flex;
  height: 100%;
`;

const IllustrationPanel = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  padding: 1rem;
  width: 50%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
`;

const ControlsPanel = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex-grow: 1;

  button {
    font-size: 1.2rem;
    padding: 0.75rem 2rem;
  }
`;

const ButtonStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const StatusRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  column-gap: 1rem;
`;

const StatusTitle = styled(H2)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusSubtitle = styled.div`
  grid-column: 1 / -1;
`;

const BatchLabel = styled(H2)`
  margin: 0;
  white-space: nowrap;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

function StatusHeader({
  title,
  subtitle,
  batch,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  batch?: { label: string };
}): JSX.Element {
  return (
    <StatusRow>
      <StatusTitle>{title}</StatusTitle>
      <div>{batch && <BatchLabel>{batch.label}</BatchLabel>}</div>
      {subtitle && <StatusSubtitle>{subtitle}</StatusSubtitle>}
    </StatusRow>
  );
}

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

const PageOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
`;

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
        {/* Folded-down corner */}
        <path d="M79 1 V23 H101" />
      </svg>
      <PageOverlay>{children}</PageOverlay>
    </PageWrapper>
  );
}

const SheetCountLabel = styled.div`
  font-size: 1.4rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const SheetCountValue = styled.div`
  font-size: 5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
`;

function SheetCount({ count }: { count: number }): JSX.Element {
  return (
    <div style={{ textAlign: 'center' }}>
      <SheetCountLabel>Sheets</SheetCountLabel>
      <SheetCountValue data-testid="batch-sheet-count">
        {format.count(count)}
      </SheetCountValue>
    </div>
  );
}

export interface ScanBallotsScreenProps {
  status: Exclude<ScanStatus, { state: 'needsReview' }>;
  isPollingPlaceUnconfigured: boolean;
}

export function ScanBallotsScreen({
  status,
  isPollingPlaceUnconfigured,
}: ScanBallotsScreenProps): JSX.Element {
  const scanBatchMutation = scanBatch.useMutation();
  const pauseBatchMutation = pauseBatch.useMutation();
  const resumeBatchMutation = resumeBatch.useMutation();
  const saveBatchMutation = saveBatch.useMutation();
  const discardBatchMutation = discardBatch.useMutation();
  const networkStatusQuery = getNetworkStatus.usePollingQuery();
  const isNetworkingEnabled = networkStatusQuery.data?.isEnabled ?? false;
  const anyMutationIsLoading = [
    scanBatchMutation,
    pauseBatchMutation,
    resumeBatchMutation,
    saveBatchMutation,
    discardBatchMutation,
  ].some((mutation) => mutation.isLoading);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  function closeSaveModal() {
    setIsConfirmingSave(false);
  }

  function closeDiscardModal() {
    setIsConfirmingDiscard(false);
  }

  const batch =
    status.state === 'idle'
      ? undefined
      : status.batches.find((b) => b.id === status.batchId);
  const sheetCount = batch?.count ?? 0;

  const stats = (
    <div style={{ marginTop: 'auto' }}>
      <BatchSummaryStats status={status} />
    </div>
  );

  return (
    <NavigationScreen title="Scan Ballots" noPadding>
      {(() => {
        switch (status.state) {
          case 'idle':
            if (!status.isScannerAttached) {
              return (
                <Container>
                  <IllustrationPanel>
                    <PageIllustration dashed />
                  </IllustrationPanel>
                  <ControlsPanel>
                    <StatusHeader
                      title={
                        <React.Fragment>
                          <Icons.Closed color="danger" />
                          Disconnected
                        </React.Fragment>
                      }
                      subtitle="Connect the scanner to begin scanning."
                      batch={batch}
                    />
                    {stats}
                  </ControlsPanel>
                </Container>
              );
            }
            return (
              <Container>
                <IllustrationPanel>
                  <PageIllustration dashed>
                    <Icons.ArrowCircleUp style={{ height: '8rem' }} />
                  </PageIllustration>
                </IllustrationPanel>
                <ControlsPanel>
                  <StatusHeader
                    title="Ready to Scan"
                    subtitle="Place ballots in the input tray"
                    batch={batch}
                  />
                  {isPollingPlaceUnconfigured && (
                    <Callout color="warning" icon="Warning">
                      No polling place selected. Select a polling place on the
                      Settings screen before scanning ballots.
                    </Callout>
                  )}
                  <Button
                    variant="primary"
                    icon="PlayCircle"
                    onPress={() => scanBatchMutation.mutate()}
                    disabled={
                      anyMutationIsLoading || isPollingPlaceUnconfigured
                    }
                  >
                    Start Scanning
                  </Button>
                  {stats}
                </ControlsPanel>
              </Container>
            );

          case 'scanning':
            return (
              <Container>
                <IllustrationPanel>
                  <PageIllustration active>
                    <SheetCount count={sheetCount} />
                  </PageIllustration>
                </IllustrationPanel>
                <ControlsPanel>
                  <StatusHeader
                    title={
                      <React.Fragment>
                        <Icons.Loading color="primary" />
                        Scanning
                      </React.Fragment>
                    }
                    batch={batch}
                  />
                  <Button
                    fill="tinted"
                    color="neutral"
                    onPress={() => pauseBatchMutation.mutate()}
                    disabled={anyMutationIsLoading}
                    icon="PauseCircle"
                  >
                    {pauseBatchMutation.isLoading
                      ? 'Pausing…'
                      : 'Pause Scanning'}
                  </Button>
                  {stats}
                </ControlsPanel>
              </Container>
            );

          case 'paused': {
            const pauseReasonText: Record<
              BatchPauseReason['type'],
              string | undefined
            > = {
              'tray-empty': 'Input tray empty',
              review: 'A ballot required review',
              manual: undefined,
            };
            return (
              <Container>
                <IllustrationPanel>
                  <PageIllustration>
                    <SheetCount count={sheetCount} />
                  </PageIllustration>
                </IllustrationPanel>
                <ControlsPanel>
                  {status.isScannerAttached ? (
                    <StatusHeader
                      title={
                        <React.Fragment>
                          <Icons.PauseCircle />
                          Paused
                        </React.Fragment>
                      }
                      subtitle={pauseReasonText[status.pauseReason.type]}
                      batch={batch}
                    />
                  ) : (
                    <StatusHeader
                      title={
                        <React.Fragment>
                          <Icons.Closed color="danger" />
                          Disconnected
                        </React.Fragment>
                      }
                      subtitle="Connect the scanner to continue scanning."
                      batch={batch}
                    />
                  )}
                  <ButtonStack>
                    {status.pauseReason.type === 'tray-empty' && (
                      <Button
                        variant="primary"
                        icon="Done"
                        onPress={() => setIsConfirmingSave(true)}
                        disabled={anyMutationIsLoading}
                      >
                        Save Batch
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onPress={() => resumeBatchMutation.mutate()}
                      disabled={
                        anyMutationIsLoading || !status.isScannerAttached
                      }
                      icon="PlayCircle"
                    >
                      Continue Scanning
                    </Button>
                    <Button
                      fill="tinted"
                      onPress={() => setIsConfirmingDiscard(true)}
                      disabled={anyMutationIsLoading}
                      icon="Trash"
                    >
                      Discard Batch
                    </Button>
                  </ButtonStack>
                  {stats}
                </ControlsPanel>
              </Container>
            );
          }

          case 'error':
            return (
              <Container>
                <IllustrationPanel>
                  <PageIllustration>
                    <SheetCount count={sheetCount} />
                  </PageIllustration>
                </IllustrationPanel>
                <ControlsPanel>
                  <StatusHeader
                    title={
                      <React.Fragment>
                        <Icons.Closed color="danger" />
                        Error
                      </React.Fragment>
                    }
                    subtitle="Discard this batch, then rescan the ballots."
                    batch={batch}
                  />
                  <Button
                    fill="tinted"
                    onPress={() => setIsConfirmingDiscard(true)}
                    disabled={anyMutationIsLoading}
                    icon="Trash"
                  >
                    Discard Batch
                  </Button>
                  {stats}
                </ControlsPanel>
              </Container>
            );

          default:
            throwIllegalValue(status, 'state');
        }
      })()}

      {isConfirmingSave && (
        <Modal
          title="Save Batch"
          content={
            <P>
              All {format.count(sheetCount)} sheets scanned in this batch will
              be saved{isNetworkingEnabled && ' and sent to VxAdmin'}.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                icon="Done"
                onPress={() =>
                  saveBatchMutation.mutate(undefined, {
                    onSuccess: closeSaveModal,
                  })
                }
                disabled={anyMutationIsLoading}
              >
                Save Batch
              </Button>
              <Button onPress={closeSaveModal} disabled={anyMutationIsLoading}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={anyMutationIsLoading ? undefined : closeSaveModal}
        />
      )}
      {isConfirmingDiscard && (
        <Modal
          title="Discard Batch"
          content={
            <P>
              All sheets scanned in this batch will be permanently discarded.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Delete"
                onPress={() =>
                  discardBatchMutation.mutate(undefined, {
                    onSuccess: closeDiscardModal,
                  })
                }
                disabled={anyMutationIsLoading}
              >
                Discard Batch
              </Button>
              <Button
                onPress={closeDiscardModal}
                disabled={anyMutationIsLoading}
              >
                Close
              </Button>
            </React.Fragment>
          }
          onOverlayClick={anyMutationIsLoading ? undefined : closeDiscardModal}
        />
      )}
    </NavigationScreen>
  );
}
