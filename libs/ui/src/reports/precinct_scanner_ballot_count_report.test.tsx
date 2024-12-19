import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { formatElectionHashes } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';

import { PrecinctScannerBallotCountReport } from './precinct_scanner_ballot_count_report';

const electionGeneralDefinition = readElectionGeneralDefinition();
const pollsTransitionedTime = new Date(2021, 8, 19, 11, 5).getTime();
const reportPrintedTime = new Date(2021, 8, 19, 11, 6).getTime();

test('renders info properly', () => {
  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionGeneralDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      totalBallotsScanned={23}
      pollsTransition="pause_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  // Check header
  screen.getByText('Test Report');
  screen.getByText('Voting Paused Report • All Precincts');
  screen.getByText(
    'General Election, Nov 3, 2020, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Voting Paused:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Voting Paused: Sep 19, 2021, 11:05 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06 AM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionGeneralDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // Check contents
  const ballotsScannedCount = screen.getByText('Sheets Scanned Count');
  expect(ballotsScannedCount.parentElement).toHaveTextContent(
    'Sheets Scanned Count23'
  );

  const pollsStatus = screen.getByText('Polls Status');
  expect(pollsStatus.parentElement).toHaveTextContent('Polls StatusPaused');

  const timePollsPaused = screen.getByText('Time Voting Paused');
  expect(timePollsPaused.parentElement).toHaveTextContent(
    'Time Voting PausedSun, Sep 19, 2021, 11:05 AM'
  );
});
