import { BallotCountReport } from '@votingworks/ui';
import {
  BallotPaperSize,
  ElectionDefinition,
  ElectionId,
  Tabulation,
} from '@votingworks/types';
import {
  DateWithoutTime,
  assert,
  assertDefined,
  range,
} from '@votingworks/basics';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import { getCurrentTime } from '../util/get_current_time';

const REPORT_NUM_ROWS = 30;
const REPORT_ROW_RANGE = range(0, REPORT_NUM_ROWS);

function getMockElectionDefinition(): ElectionDefinition {
  return {
    ballotHash: 'mock-ballot-hash',
    electionData: 'mock-election-data',
    election: {
      id: 'mock-election-id' as ElectionId,
      state: 'Mock State',
      county: {
        id: 'mock-county',
        name: 'Mock County',
      },
      title: '',
      type: 'general',
      date: new DateWithoutTime(
        assertDefined(new Date(getCurrentTime()).toISOString().split('T')[0])
      ),
      seal: '',
      parties: [],
      districts: [],
      precincts: REPORT_ROW_RANGE.map((i) => ({
        id: `precinct-${i}`,
        name: `Mock Precinct`,
      })),
      contests: [],
      ballotStyles: [],
      ballotLayout: {
        paperSize: BallotPaperSize.Letter,
        metadataEncoding: 'qr-code',
      },
      ballotStrings: {},
    },
  };
}

const allMockCardCounts: Tabulation.GroupList<Tabulation.CardCounts> =
  REPORT_ROW_RANGE.map((i) => ({
    bmd: 0,
    hmpb: [0],
    precinctId: `precinct-${i}`,
  }));

/**
 * Prints a test page for diagnostic purposes. Uses a mock ballot count
 * report. The exact content of the report is not important, only that it
 * prints the sort of text, lines, and shading that will appear on our
 * actual reports, and help diagnose printer issues.
 */
export async function printTestPage({
  printer,
  logger,
}: {
  printer: Printer;
  logger: Logger;
}): Promise<void> {
  const report = BallotCountReport({
    title: 'Print Diagnostic Test Page',
    isOfficial: true,
    isTest: false, // do not want to prefix with the title with "Test"
    electionDefinition: getMockElectionDefinition(),
    scannerBatches: [],
    generatedAtTime: new Date(getCurrentTime()),
    groupBy: {
      groupByPrecinct: true,
    },
    cardCountsList: allMockCardCounts,
  });

  const data = await renderToPdf({ document: report });
  try {
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
      message: `User started a print diagnostic by printing a test page.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
      message: `Error attempting to send test page to the printer: ${error.message}`,
      disposition: 'failure',
    });
  }
}
