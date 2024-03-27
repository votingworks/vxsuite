import { PrecinctScannerTallyReport } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { renderToPdf } from '@votingworks/printing';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { VX_MACHINE_ID } from '@votingworks/backend';
import { getCurrentTime } from '../util/get_current_time';
import { FujitsuPrintResult, Printer } from './printer';

/**
 * Prints a test page for diagnostic purposes. Uses a mock tally
 * report. The exact content of the report is not important, only that it
 * tests printing. Only supported for V4 hardware.
 */
export async function printTestPage({
  printer,
}: {
  printer: Printer;
}): Promise<FujitsuPrintResult> {
  assert(printer.scheme === 'hardware-v4');
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const { contests } = election;
  const report = PrecinctScannerTallyReport({
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    contests,
    scannedElectionResults: getEmptyElectionResults(election),
    pollsTransition: 'open_polls',
    isLiveMode: false,
    pollsTransitionedTime: getCurrentTime(),
    reportPrintedTime: getCurrentTime(),
    precinctScannerMachineId: VX_MACHINE_ID,
  });

  const data = await renderToPdf({ document: report });
  return await printer.print(data);
}
