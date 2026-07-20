import { useState } from 'react';
import {
  Button,
  Callout,
  Font,
  H2,
  Icons,
  P,
  TD,
  Table,
} from '@votingworks/ui';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { NavigationScreen } from '../navigation_screen';
import { BatchControlCard } from '../components/batch_control_card';
import { shortDateTime } from '../util/date_time';

/*
 * The history sheet expands from a zero-height grid row, so opening/closing
 * animates smoothly in both directions while the batch control card shrinks
 * and grows in sync.
 */
const Content = styled.div<{ historyOpen?: boolean }>`
  display: grid;
  grid-template-rows: auto ${(p) => (p.historyOpen ? '1fr' : '0fr')};
  transition: grid-template-rows 0.3s ease;
  height: 100%;
`;

const ControlArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 60rem;
  margin: 0 auto;
  width: 100%;
`;

const SavedBatchesStats = styled(Callout)`
  div {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    gap: 2rem;
  }

  p {
    margin-bottom: 0;
  }
`;

const SavedBatchesRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const HistorySheet = styled.div`
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  /* Bleed past the screen padding so the sheet reaches the screen edges. */
  margin: 0 -1rem -1rem;
`;

const HistorySheetInner = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
  border-top: 1px solid ${(p) => p.theme.colors.outline};
  background: ${(p) => p.theme.colors.background};
`;

const HistorySheetHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.outline};

  h2 {
    margin-bottom: 0;
  }
`;

const HistorySheetContent = styled.div`
  overflow-y: auto;
  padding: 1rem;
`;

export interface PollWorkerScanBallotsScreenProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
}

export function PollWorkerScanBallotsScreen({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
}: PollWorkerScanBallotsScreenProps): JSX.Element {
  // the open batch appears in the batch control card, not the saved list
  const batches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );
  const batchCount = batches.length;
  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();
  const [isHistoryShown, setIsHistoryShown] = useState(false);
  const historyOpen = isHistoryShown && batchCount > 0;

  return (
    <NavigationScreen title="Scan Ballots">
      <Content historyOpen={historyOpen}>
        <ControlArea>
          {isPollingPlaceUnconfigured && (
            <Callout color="warning" icon="Warning">
              No polling place selected. Ask an election manager to select a
              polling place before scanning ballots.
            </Callout>
          )}
          <BatchControlCard
            status={status}
            statusIsStale={statusIsStale}
            isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
            large
            minimized={historyOpen}
          />
          {batchCount ? (
            <SavedBatchesRow>
              <SavedBatchesStats color="neutral" style={{ gap: '3rem' }}>
                <P>
                  <Font weight="bold">Saved Batches:</Font>{' '}
                  {format.count(batchCount)}
                </P>
                <P>
                  <Font weight="bold">Total Sheets:</Font>{' '}
                  {format.count(ballotCount)}
                </P>
              </SavedBatchesStats>
              {!historyOpen && (
                <Button
                  icon="ChevronUp"
                  onPress={() => setIsHistoryShown(true)}
                >
                  Show Batch History
                </Button>
              )}
            </SavedBatchesRow>
          ) : (
            <P>
              <Icons.Info /> No batches have been saved
            </P>
          )}
        </ControlArea>
        {batchCount > 0 && (
          <HistorySheet
            role="complementary"
            aria-label="Batch History"
            aria-hidden={!historyOpen}
          >
            <HistorySheetInner>
              <HistorySheetHeader>
                <H2>Batch History</H2>
                <Button
                  icon="ChevronDown"
                  onPress={() => setIsHistoryShown(false)}
                >
                  Close
                </Button>
              </HistorySheetHeader>
              <HistorySheetContent>
                <Table>
                  <thead>
                    <tr>
                      <th>Batch Name</th>
                      <th>Sheet Count</th>
                      <th>Started At</th>
                      <th>Finished At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.id}>
                        <td>{batch.label}</td>
                        <td>{format.count(batch.count)}</td>
                        <TD nowrap>{shortDateTime(batch.startedAt)}</TD>
                        <TD nowrap>
                          {batch.endedAt ? shortDateTime(batch.endedAt) : null}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </HistorySheetContent>
            </HistorySheetInner>
          </HistorySheet>
        )}
      </Content>
    </NavigationScreen>
  );
}
