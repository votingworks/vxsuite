import type { ScanStatus } from '@votingworks/central-scan-backend';
import { ScanBallotsLayout } from '../components/scan_ballots_layout';

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
  return (
    <ScanBallotsLayout
      status={status}
      statusIsStale={statusIsStale}
      isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
      pollingPlaceWarning="No polling place selected. Ask an election manager to select a polling place before scanning ballots."
    />
  );
}
