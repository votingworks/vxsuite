import { BallotCountReport } from '@votingworks/ui';
import {
  ElectionDefinition,
  ElectionId,
  HmpbBallotPaperSize,
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
    ballotHash: '00000000000000000000',
    electionData: 'test-election-data',
    election: {
      id: 'test-election-id' as ElectionId,
      state: 'Test State',
      county: {
        id: 'test-county',
        name: 'Test County',
      },
      title: 'Test Election',
      type: 'general',
      date: new DateWithoutTime(
        assertDefined(new Date(getCurrentTime()).toISOString().split('T')[0])
      ),
      seal: '',
      parties: [],
      districts: [],
      precincts: REPORT_ROW_RANGE.map((i) => ({
        id: `precinct-${i}`,
        name: `Test Precinct`,
        districtIds: [],
      })),
      contests: [],
      ballotStyles: [],
      ballotLayout: {
        paperSize: HmpbBallotPaperSize.Letter,
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
    isTest: true,
    electionDefinition: getMockElectionDefinition(),
    electionPackageHash: '00000000000000000000',
    scannerBatches: [],
    generatedAtTime: new Date(getCurrentTime()),
    groupBy: {
      groupByPrecinct: true,
    },
    cardCountsList: allMockCardCounts,
  });

  try {
    // The test print shouldn't hit the PDF size limit
    const data = (await renderToPdf({ document: report })).unsafeUnwrap();
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
