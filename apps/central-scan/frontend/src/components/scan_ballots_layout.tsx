import { Callout } from '@votingworks/ui';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { NavigationScreen } from '../navigation_screen';
import { BatchControlCard } from './batch_control_card';
import { BatchSummaryStats } from './batch_summary_stats';

export interface ScanBallotsLayoutProps {
  status: ScanStatus;
  statusIsStale: boolean;
  isPollingPlaceUnconfigured: boolean;
  pollingPlaceWarning: string;
}

export function ScanBallotsLayout({
  status,
  statusIsStale,
  isPollingPlaceUnconfigured,
  pollingPlaceWarning,
}: ScanBallotsLayoutProps): JSX.Element {
  return (
    <NavigationScreen title="Scan Ballots" noPadding>
      <BatchControlCard
        status={status}
        statusIsStale={statusIsStale}
        isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
        notice={
          isPollingPlaceUnconfigured && (
            <Callout color="warning" icon="Warning">
              {pollingPlaceWarning}
            </Callout>
          )
        }
        actionsFooter={<BatchSummaryStats status={status} />}
      />
    </NavigationScreen>
  );
}
