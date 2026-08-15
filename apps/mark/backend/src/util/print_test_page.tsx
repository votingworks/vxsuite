import { BmdPaperBallot } from '@votingworks/ui';
import {
  BallotType,
  ElectionDefinition,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import { DateWithoutTime, assertDefined } from '@votingworks/basics';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import { getCurrentTime } from './get_current_time.js';

function getMockElectionDefinition(): ElectionDefinition {
  const today = getCurrentTime();
  return {
    ballotHash: '00000000000000000000',
    electionData: 'test-election-data',
    election: {
      id: 'test-election-id',
      state: 'Test State',
      jurisdiction: {
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
      pollingPlaces: [
        {
          id: 'polling-place-0',
          name: 'Test Precinct',
          precincts: { 'precinct-0': { type: 'whole' } },
          type: 'election_day',
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
          languages: ['en'],
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
  const encodedBallot = encodeSummaryBallotPage(
    mockElectionDefinition.election,
    {
      ballotHash: mockElectionDefinition.ballotHash,
      ballotStyleId: 'ballot-style-0',
      precinctId: 'precinct-0',
      votes: {},
      isTestMode: true,
      ballotType: BallotType.Precinct,
      pageNumber: 1,
      totalPages: 1,
      ballotAuditId: 'test-page-audit-id',
      contests: mockElectionDefinition.election.contests,
    }
  );

  const ballot = (
    <BmdPaperBallot
      electionDefinition={mockElectionDefinition}
      ballotStyleId={'ballot-style-0'}
      precinctId={'precinct-0'}
      votes={{}}
      isLiveMode={false}
      machineType="mark"
      pageNumber={1}
      totalPages={1}
      contestsForPage={mockElectionDefinition.election.contests}
      encodedBallot={encodedBallot}
    />
  );

  const data = (await renderToPdf({ document: ballot })).unsafeUnwrap();
  await printer.print({ data, isM404nSupportRequired: true });
  await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
    message: `User started a print diagnostic by printing a test page.`,
    disposition: 'success',
  });
}
