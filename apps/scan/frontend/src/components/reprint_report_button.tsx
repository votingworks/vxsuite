import { Button } from '@votingworks/ui';
import type { PollsTransition } from '@votingworks/scan-backend';
import { getPollsReportTitle } from '@votingworks/utils';
import { getPrinterStatus, printTallyReport } from '../api';

interface ReprintReportButtonProps {
  lastPollsTransition: PollsTransition;
  scannedBallotCount: number;
  isAdditional: boolean;
  beforePrint: () => void;
  afterPrint: (numPages: number) => void;
}

export function ReprintReportButton({
  scannedBallotCount,
  lastPollsTransition,
  isAdditional,
  beforePrint,
  afterPrint,
}: ReprintReportButtonProps): JSX.Element | null {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printTallyReportMutation = printTallyReport.useMutation();

  async function reprintReport() {
    beforePrint();
    const numPages = await printTallyReportMutation.mutateAsync();
    afterPrint(numPages);
  }

  const ballotCountHasNotChanged =
    lastPollsTransition?.ballotCount === scannedBallotCount;

  const canPrintReport =
    printerStatusQuery.data?.connected && ballotCountHasNotChanged;

  return (
    <Button onPress={reprintReport} disabled={!canPrintReport}>
      Print {isAdditional ? 'Additional ' : ''}
      {getPollsReportTitle(lastPollsTransition.type)}
    </Button>
  );
}
