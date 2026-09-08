import { expect, test } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  straightPartyNotYetImplemented,
  anyPollingPlace,
  BatchInfo,
  formatElectionHashes,
} from '@votingworks/types';
import { buildElectionResultsFixture } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { render, screen, within } from '../../test/react_testing_library.js';

import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report.js';

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
    bmd: [100],
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
  const [pollingPlace] = assertDefined(generalElection.pollingPlaces);

  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={pollingPlace.id}
      pollsTransition="open_polls"
      isLiveMode={false}
      scannedElectionResults={generalElectionResults}
      contests={generalElection.contests}
      batches={[]}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Test Report');
  screen.getByText(`Polls Opened Report • ${pollingPlace.name}`);
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Polls Opened:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Opened: Sep 19, 2021, 11:05:00 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06:00 AM'
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

  within(screen.getByTestId('total-ballot-count')).getByText('100');
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
    bmd: [100],
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
  const [pollingPlace] = assertDefined(electionTwoPartyPrimary.pollingPlaces);

  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={pollingPlace.id}
      pollsTransition="open_polls"
      isLiveMode
      scannedElectionResults={primaryElectionResults}
      contests={electionTwoPartyPrimary.contests.filter((c) => {
        if (c.type === 'straight-party') {
          straightPartyNotYetImplemented();
        }
        return c.type === 'yesno' || c.partyId === '0';
      })}
      partyId="0"
      batches={[]}
    />
  );
  screen.getByText(`Polls Opened Report • ${pollingPlace.name}`);
  screen.getByText('Mammal Party');
  screen.getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  const eventDate = screen.getByText('Polls Opened:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Opened: Sep 19, 2021, 11:05:00 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06:00 AM'
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

  within(screen.getByTestId('total-ballot-count')).getByText('100');
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
  const [pollingPlace] = assertDefined(electionTwoPartyPrimary.pollingPlaces);

  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={pollingPlace.id}
      pollsTransition="open_polls"
      isLiveMode
      scannedElectionResults={primaryElectionResults}
      contests={electionTwoPartyPrimary.contests.filter(
        (c) => c.id === 'best-animal-mammal'
      )}
      partyId="0"
      batches={[]}
    />
  );

  screen.getByTestId('results-table-best-animal-mammal');
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(1);
});

const singleBatch: BatchInfo = {
  id: 'c1d2e3f4-a5b6-4789-abcd-ef1234567890',
  batchNumber: 1,
  label: 'Batch 1',
  startedAt: '2021-09-19T08:00:00.000Z',
  endedAt: '2021-09-19T11:05:00.000Z',
  count: 100,
  pollingPlaceId: anyPollingPlace(generalElectionDefinition.election).id,
};

const multiBatch: BatchInfo[] = [
  singleBatch,
  {
    id: 'd4e5f6a7-b8c9-4012-5678-9a0bcdef0123',
    batchNumber: 2,
    label: 'Batch 2',
    startedAt: '2021-09-19T13:00:00.000Z',
    endedAt: '2021-09-19T15:00:00.000Z',
    count: 50,
    pollingPlaceId: anyPollingPlace(generalElectionDefinition.election).id,
  },
];

test('shows batch ID in header metadata for single batch (close_polls)', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={anyPollingPlace(generalElectionDefinition.election).id}
      pollsTransition="close_polls"
      isLiveMode={false}
      scannedElectionResults={generalElectionResults}
      contests={generalElection.contests}
      batches={[singleBatch]}
    />
  );

  const batchIdLabel = screen.getByText('Batch ID:');
  expect(batchIdLabel.parentElement).toHaveTextContent(
    'Batch ID: c1d2e3f4-ef1234567890'
  );
  expect(screen.queryByText('Batch Summary')).toBeNull();
});

test('shows batch table (not header batch ID) for multiple batches (close_polls)', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={anyPollingPlace(generalElectionDefinition.election).id}
      pollsTransition="close_polls"
      isLiveMode={false}
      scannedElectionResults={generalElectionResults}
      contests={generalElection.contests}
      batches={multiBatch}
    />
  );

  expect(screen.queryByText('Batch ID:')).toBeNull();
  screen.getByText('Batch ID');
  screen.getByText('c1d2e3f4-ef1234567890');
  screen.getByText('d4e5f6a7-9a0bcdef0123');
});

test('shows no batch info when batches is empty (open_polls)', () => {
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={anyPollingPlace(generalElectionDefinition.election).id}
      pollsTransition="open_polls"
      isLiveMode={false}
      scannedElectionResults={generalElectionResults}
      contests={generalElection.contests}
      batches={[]}
    />
  );

  expect(screen.queryByText('Batch ID:')).toBeNull();
  expect(screen.queryByText('Batch ID')).toBeNull();
});
