import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { formatElectionHashes, PartyId } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen, within } from '../../test/react_testing_library';

import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const electionTwoPartyPrimary = electionTwoPartyPrimaryDefinition.election;

const generalElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const generalElection = generalElectionDefinition.election;

const pollsTransitionedTime = new Date(2021, 8, 19, 11, 5).getTime();
const reportPrintedTime = new Date(2021, 8, 19, 11, 6).getTime();

const generalElectionResults = buildElectionResultsFixture({
  election: generalElectionDefinition.election,
  cardCounts: {
    bmd: 100,
    hmpb: [],
  },
  contestResultsSummaries: {
    'board-of-alderman': {
      type: 'candidate',
      undervotes: 120,
      overvotes: 0,
      ballots: 100,
      officialOptionTallies: {
        'helen-keller': 280,
      },
    },
  },
  includeGenericWriteIn: true,
});

test('renders as expected for a single precinct in a general election', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={singlePrecinctSelectionFor(
        generalElection.precincts[0].id
      )}
      pollsTransition="open_polls"
      isLiveMode={false}
      scannedElectionResults={generalElectionResults}
      contests={generalElection.contests}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Test Report');
  screen.getByText('Polls Opened Report • North Lincoln');
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Polls Opened:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Opened: Sep 19, 2021, 11:05 AM'
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
        generalElectionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  within(screen.getByTestId('bmd')).getByText('100');
  const boardOfAlderman = screen.getByTestId('results-table-board-of-alderman');
  within(boardOfAlderman).getByText(/100 ballots cast/);
  within(boardOfAlderman).getByText(/0 overvotes/);
  within(boardOfAlderman).getByText(/120 undervotes/);
  within(screen.getByTestId('board-of-alderman-helen-keller')).getByText('280');
  within(screen.getByTestId('board-of-alderman-steve-jobs')).getByText('0');
  within(screen.getByTestId('board-of-alderman-nikola-tesla')).getByText('0');

  within(screen.getByTestId('results-table-mayor')).getByText(/0 ballots cast/);
  within(screen.getByTestId('results-table-controller')).getByText(
    /0 ballots cast/
  );
});

const primaryElectionResults = buildElectionResultsFixture({
  election: electionTwoPartyPrimary,
  cardCounts: {
    bmd: 100,
    hmpb: [],
  },
  contestResultsSummaries: {
    'best-animal-mammal': {
      type: 'candidate',
      undervotes: 20,
      overvotes: 0,
      ballots: 100,
      officialOptionTallies: {
        horse: 80,
      },
    },
  },
  includeGenericWriteIn: true,
});

test('renders as expected for all precincts in a primary election', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="open_polls"
      isLiveMode
      scannedElectionResults={primaryElectionResults}
      contests={electionTwoPartyPrimary.contests.filter(
        (c) => c.type === 'yesno' || c.partyId === '0'
      )}
      partyId={'0' as PartyId}
    />
  );
  screen.getByText('Polls Opened Report • All Precincts');
  screen.getByText('Mammal Party');
  screen.getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  const eventDate = screen.getByText('Polls Opened:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Opened: Sep 19, 2021, 11:05 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06 AM'
  );
  expect(screen.queryByTestId('results-table-best-animal-fish')).toBeNull();
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionTwoPartyPrimaryDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  within(screen.getByTestId('bmd')).getByText('100');
  expect(screen.queryByTestId('results-table-best-animal-fish')).toBeNull();
  const bestAnimal = screen.getByTestId('results-table-best-animal-mammal');
  within(bestAnimal).getByText(/100 ballots cast/);
  within(bestAnimal).getByText(/0 overvotes/);
  within(bestAnimal).getByText(/20 undervotes/);
  within(screen.getByTestId('best-animal-mammal-otter')).getByText('0');
  within(screen.getByTestId('best-animal-mammal-horse')).getByText('80');
  within(screen.getByTestId('best-animal-mammal-fox')).getByText('0');
  expect(within(bestAnimal).queryByText('Write-In')).toBeNull();
});

test('displays only passed contests', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="open_polls"
      isLiveMode
      scannedElectionResults={primaryElectionResults}
      contests={electionTwoPartyPrimary.contests.filter(
        (c) => c.id === 'best-animal-mammal'
      )}
      partyId={'0' as PartyId}
    />
  );

  screen.getByTestId('results-table-best-animal-mammal');
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(1);
});
