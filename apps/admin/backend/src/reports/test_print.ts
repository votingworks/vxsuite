import { BallotCountReport } from '@votingworks/ui';
import {
  BallotPaperSize,
  ElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import { assert, range } from '@votingworks/basics';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { getCurrentTime } from '../util/get_current_time';

const REPORT_NUM_ROWS = 30;
const REPORT_ROW_RANGE = range(0, REPORT_NUM_ROWS);

function getMockElectionDefinition(): ElectionDefinition {
  return {
    electionHash: 'mock-election-hash',
    electionData: 'mock-election-data',
    election: {
      state: 'Mock State',
      county: {
        id: 'mock-county',
        name: 'Mock County',
      },
      title: '',
      type: 'general',
      date: new Date(getCurrentTime()).toISOString(),
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
  userRole,
}: {
  printer: Printer;
  logger: Logger;
  userRole: LoggingUserRole;
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

  const data = await renderToPdf(report);
  try {
    await printer.print({ data });
    await logger.log(LogEventId.DiagnosticInit, userRole, {
      message: `User started a print diagnostic by printing a test page.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.log(LogEventId.DiagnosticInit, userRole, {
      message: `Error attempting to send test page to the printer: ${error.message}`,
      disposition: 'failure',
    });
  }
}
