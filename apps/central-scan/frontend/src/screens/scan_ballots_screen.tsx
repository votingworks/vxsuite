import { Callout, Font, Icons, P } from '@votingworks/ui';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';
import { NavigationScreen } from '../navigation_screen.js';
import { ScanButton } from '../components/scan_button.js';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TopBarStats = styled(Callout)`
  div {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    gap: 2rem;
  }

  p {
    margin-bottom: 0;
  }
`;

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export interface ScanBallotsScreenProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
}

export function ScanBallotsScreen({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
}: ScanBallotsScreenProps): JSX.Element {
  const { batches, state } = status;
  const isScanning = state === 'scanning';
  const batchCount = batches.length;

  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  return (
    <NavigationScreen title="Scan Ballots">
      <Content>
        {isPollingPlaceUnconfigured && (
          <Callout color="warning" icon="Warning">
            No polling place selected. Select a polling place on the Settings
            screen before scanning ballots.
          </Callout>
        )}
        <TopBar>
          {batchCount ? (
            <TopBarStats color="neutral" style={{ gap: '3rem' }}>
              <P>
                <Font weight="bold">Total Batches:</Font>{' '}
                {format.count(batchCount)}
              </P>
              <P>
                <Font weight="bold">Total Sheets:</Font>{' '}
                {format.count(ballotCount)}
              </P>
            </TopBarStats>
          ) : (
            <P>
              <Icons.Info /> No ballots have been scanned
            </P>
          )}
          <TopBarActions>
            <ScanButton
              /* disable scan button while status query is refetching to avoid double clicks */
              disabled={
                isScanning || statusIsStale || isPollingPlaceUnconfigured
              }
              isScannerAttached={status.state !== 'disconnected'}
            />
          </TopBarActions>
        </TopBar>
      </Content>
    </NavigationScreen>
  );
}
