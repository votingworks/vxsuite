import { assert, assertDefined } from '@votingworks/basics';
import { PrecinctScannerWriteInImageReport } from '@votingworks/ui';
import { PAPER_DIMENSIONS, renderToPdf } from '@votingworks/printing';
import {
  FujitsuThermalPrinterInterface,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import { Store } from '../store';
import { getMachineConfig } from '../machine_config';
import { getCurrentTime } from '../util/get_current_time';
import { ADJUSTED_MARGIN_DIMENSIONS } from './constants';

export async function printWriteInImageReport({
  store,
  printer,
}: {
  store: Store;
  printer: FujitsuThermalPrinterInterface;
}): Promise<PrintResult> {
  const { electionDefinition, electionPackageHash } = assertDefined(
    store.getElectionRecord()
  );
  const precinctSelection = store.getPrecinctSelection();
  assert(precinctSelection);
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();

  const contestWriteIns = await store.getWriteInReportData();

  const report = PrecinctScannerWriteInImageReport({
    electionDefinition,
    electionPackageHash,
    precinctSelection,
    isLiveMode,
    reportPrintedTime: getCurrentTime(),
    precinctScannerMachineId: machineId,
    contestWriteIns,
  });

  const data = (
    await renderToPdf({
      document: report,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
      marginDimensions: ADJUSTED_MARGIN_DIMENSIONS,
    })
  ).unsafeUnwrap();

  return printer.printPdf(data);
}
