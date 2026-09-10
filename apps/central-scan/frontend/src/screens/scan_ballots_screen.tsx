import { Callout } from '@votingworks/ui';
import styled from 'styled-components';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { NavigationScreen } from '../navigation_screen.js';
import { ScanButton } from '../components/scan_button.js';
import { BatchSummaryStats } from '../components/batch_summary_stats.js';

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
  const isScanning = status.state === 'scanning';

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
          <BatchSummaryStats status={status} />
          <ScanButton
            /* disable scan button while status query is refetching to avoid double clicks */
            disabled={isScanning || statusIsStale || isPollingPlaceUnconfigured}
            isScannerAttached={status.state !== 'disconnected'}
          />
        </TopBar>
      </Content>
    </NavigationScreen>
  );
}
