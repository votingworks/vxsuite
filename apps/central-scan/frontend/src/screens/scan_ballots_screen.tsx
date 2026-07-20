import type { ScanStatus } from '@votingworks/central-scan-backend';
import { ScanBallotsLayout } from '../components/scan_ballots_layout';

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
  return (
    <ScanBallotsLayout
      status={status}
      statusIsStale={statusIsStale}
      isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
      pollingPlaceWarning="No polling place selected. Select a polling place on the Settings screen before scanning ballots."
    />
  );
}
