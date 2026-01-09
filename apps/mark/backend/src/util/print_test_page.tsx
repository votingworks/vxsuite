import { BmdPaperBallot } from '@votingworks/ui';
import {
  ElectionDefinition,
  ElectionId,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { DateWithoutTime, assertDefined } from '@votingworks/basics';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import { getCurrentTime } from './get_current_time';

function getMockElectionDefinition(): ElectionDefinition {
  const today = getCurrentTime();
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
        assertDefined(new Date(today).toISOString().split('T')[0])
      ),
      seal: '',
      parties: [],
      districts: [
        {
          id: 'district-0',
          name: 'Test District',
        },
      ],
      precincts: [
        {
          id: `precinct-0`,
          name: `Test Precinct`,
          districtIds: ['district-0'],
        },
      ],
      contests: [
        {
          id: 'contest-0',
          type: 'candidate',
          districtId: 'district-0',
          title: 'Test Contest',
          seats: 1,
          candidates: [
            {
              id: 'candidate-0',
              name: 'Test Candidate',
            },
          ],
          allowWriteIns: false,
        },
      ],
      ballotStyles: [
        {
          id: 'ballot-style-0',
          precincts: ['precinct-0'],
          districts: ['district-0'],
          groupId: 'ballot-style-0',
        },
      ],
      ballotLayout: {
        paperSize: HmpbBallotPaperSize.Letter,
        metadataEncoding: 'qr-code',
      },
      ballotStrings: {},
    },
  };
}

/**
 * Prints a test page for diagnostic purposes. Uses a mock summary ballot.
 * The contents are not important but it demonstrates that the printer can print a non-trivial document
 * representative of what it would encounter during an actual election.
 * The summary ballot also provides a QR code that can then be used in the barcode reader diagnostic.
 */
export async function printTestPage({
  printer,
  logger,
}: {
  printer: Printer;
  logger: Logger;
}): Promise<void> {
  const mockElectionDefinition = getMockElectionDefinition();

  const ballot = (
    <BmdPaperBallot
      electionDefinition={mockElectionDefinition}
      ballotStyleId={'ballot-style-0'}
      precinctId={'precinct-0'}
      votes={{}}
      isLiveMode={false}
      machineType="mark"
    />
  );

  const data = (await renderToPdf({ document: ballot })).unsafeUnwrap();
  await printer.print({ data });
  await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
    message: `User started a print diagnostic by printing a test page.`,
    disposition: 'success',
  });
}
