import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import type { PollsTransition } from '@votingworks/scan-backend';
import { getPollsReportTitle } from '@votingworks/utils';
import { getConfig, getMachineConfig, getScannerResultsByParty } from '../api';
import { printReport } from '../utils/print_report';

interface ReprintReportButtonProps {
  printerInfo?: KioskBrowser.PrinterInfo;
  lastPollsTransition: PollsTransition;
  scannedBallotCount: number;
  isAdditional: boolean;
  beforePrint: () => void;
  afterPrint: (numPages: number) => void;
}

export function ReprintReportButton({
  scannedBallotCount,
  lastPollsTransition,
  printerInfo,
  isAdditional,
  beforePrint,
  afterPrint,
}: ReprintReportButtonProps): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();
  const scannerResultsByPartyQuery = getScannerResultsByParty.useQuery();

  async function reprintReport() {
    assert(machineConfigQuery.data);
    assert(configQuery.data);
    const { electionDefinition, precinctSelection, isTestMode } =
      configQuery.data;
    assert(electionDefinition);
    assert(precinctSelection);
    assert(scannerResultsByPartyQuery.data);
    assert(lastPollsTransition);

    beforePrint();
    await printReport({
      pollsTransitionInfo: lastPollsTransition,
      electionDefinition,
      precinctSelection,
      isLiveMode: !isTestMode,
      machineConfig: machineConfigQuery.data,
      scannerResultsByParty: scannerResultsByPartyQuery.data,
      copies: 1,
      numPagesCallback: afterPrint,
    });
  }

  const dataReady =
    machineConfigQuery.isSuccess &&
    configQuery.isSuccess &&
    scannerResultsByPartyQuery.isSuccess;
  const hasPrinter = printerInfo || !window.kiosk;
  const ballotCountHasNotChanged =
    lastPollsTransition?.ballotCount === scannedBallotCount;

  const canPrintReport = dataReady && hasPrinter && ballotCountHasNotChanged;

  return (
    <Button onPress={reprintReport} disabled={!canPrintReport}>
      Print {isAdditional ? 'Additional ' : ''}
      {getPollsReportTitle(lastPollsTransition.type)}
    </Button>
  );
}
