import { Button } from '@votingworks/ui';
import type { PollsTransition } from '@votingworks/scan-backend';
import { getPollsReportTitle } from '@votingworks/utils';
import { getPrinterStatus } from '../api';

interface ReprintReportButtonProps {
  lastPollsTransition: PollsTransition;
  scannedBallotCount: number;
  onPress: () => void;
}

export function ReprintReportButton({
  scannedBallotCount,
  lastPollsTransition,
  onPress,
}: ReprintReportButtonProps): JSX.Element | null {
  const printerStatusQuery = getPrinterStatus.useQuery();

  const ballotCountHasNotChanged =
    lastPollsTransition?.ballotCount === scannedBallotCount;

  const printerStatus = printerStatusQuery.data;
  const isPrinterReady =
    printerStatus &&
    ((printerStatus.scheme === 'hardware-v3' && printerStatus.connected) ||
      (printerStatus.scheme === 'hardware-v4' &&
        printerStatus.state === 'idle'));
  const canPrintReport = isPrinterReady && ballotCountHasNotChanged;

  return (
    <Button onPress={onPress} disabled={!canPrintReport}>
      Print {getPollsReportTitle(lastPollsTransition.type)}
    </Button>
  );
}
