import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  electionMinimalExhaustiveSample,
  electionMinimalExhaustiveSampleDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import {
  BallotIdSchema,
  CastVoteRecord,
  PartyIdSchema,
  unsafeParse,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  calculateTallyForCastVoteRecords,
  filterTallyContestsByParty,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

afterEach(() => {
  window.kiosk = undefined;
});

const {
  election: generalElection,
  electionDefinition: generalElectionDefinition,
} = electionFamousNames2021Fixtures;

const pollsTransitionedTime = new Date(2021, 8, 19, 11, 5).getTime();
const currentTime = new Date(2021, 8, 19, 11, 6).getTime();
const cvr: CastVoteRecord = {
  _precinctId: generalElection.precincts[0].id,
  _ballotId: unsafeParse(BallotIdSchema, 'test-123'),
  _ballotStyleId: generalElection.ballotStyles[0].id,
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'board-of-alderman': ['helen-keller'],
};

test('renders as expected for all precincts in a general election', () => {
  const tally = calculateTallyForCastVoteRecords(
    generalElection,
    new Set([cvr])
  );
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="close_polls"
      isLiveMode
      tally={tally}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Official Polls Closed Report for All Precincts');
  const electionTitle = screen.getByText('Lincoln Municipal General Election:');
  expect(electionTitle.parentElement).toHaveTextContent(
    'Lincoln Municipal General Election: Sunday, June 6, 2021, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Polls Closed:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Closed: Sep 19, 2021, 11:05 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06 AM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
  const countyCommissioners = screen.getByTestId(
    'results-table-board-of-alderman'
  );
  within(countyCommissioners).getByText(/1 ballot cast/);
  within(countyCommissioners).getByText(/0 overvotes/);
  within(countyCommissioners).getByText(/3 undervotes/);
  within(screen.getByTestId('board-of-alderman-helen-keller')).getByText('1');
  within(screen.getByTestId('board-of-alderman-steve-jobs')).getByText('0');
  within(screen.getByTestId('board-of-alderman-nikola-tesla')).getByText('0');

  within(screen.getByTestId('results-table-mayor')).getByText(/0 ballots cast/);
  within(screen.getByTestId('results-table-controller')).getByText(
    /0 ballots cast/
  );
});

test('renders as expected for a single precinct in a general election', () => {
  const tally = calculateTallyForCastVoteRecords(
    generalElection,
    new Set([cvr])
  );
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={generalElectionDefinition}
      precinctSelection={singlePrecinctSelectionFor(
        generalElection.precincts[0].id
      )}
      pollsTransition="open_polls"
      isLiveMode={false}
      tally={tally}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('TEST Polls Opened Report for North Lincoln');
  const electionTitle = screen.getByText('Lincoln Municipal General Election:');
  expect(electionTitle.parentElement).toHaveTextContent(
    'Lincoln Municipal General Election: Sunday, June 6, 2021, Franklin County, State of Hamilton'
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
  const countyCommissioners = screen.getByTestId(
    'results-table-board-of-alderman'
  );
  within(countyCommissioners).getByText(/1 ballot cast/);
  within(countyCommissioners).getByText(/0 overvotes/);
  within(countyCommissioners).getByText(/3 undervotes/);
  within(screen.getByTestId('board-of-alderman-helen-keller')).getByText('1');
  within(screen.getByTestId('board-of-alderman-steve-jobs')).getByText('0');
  within(screen.getByTestId('board-of-alderman-nikola-tesla')).getByText('0');

  within(screen.getByTestId('results-table-mayor')).getByText(/0 ballots cast/);
  within(screen.getByTestId('results-table-controller')).getByText(
    /0 ballots cast/
  );
});

const primaryCvr: CastVoteRecord = {
  _precinctId: 'precinct-1',
  _ballotId: unsafeParse(BallotIdSchema, 'test-123'),
  _ballotStyleId: '1M',
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'best-animal-mammal': ['otter'],
  'zoo-council-mammal': ['zebra', 'elephant'],
  'new-zoo-either': ['yes'],
  'new-zoo-pick': ['no'],
};

test('renders as expected for all precincts in a primary election', () => {
  const party0 = unsafeParse(PartyIdSchema, '0');
  const tally = filterTallyContestsByParty(
    electionMinimalExhaustiveSample,
    calculateTallyForCastVoteRecords(
      electionMinimalExhaustiveSample,
      new Set([primaryCvr])
    ),
    party0
  );
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="open_polls"
      isLiveMode
      tally={tally}
      partyId={party0}
    />
  );
  screen.getByText('Official Polls Opened Report for All Precincts');
  const electionTitle = screen.getByText(
    'Mammal Party Example Primary Election:'
  );
  expect(electionTitle.parentElement).toHaveTextContent(
    'Mammal Party Example Primary Election: Wednesday, September 8, 2021, Sample County, State of Sample'
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
  expect(screen.queryByTestId('results-table-best-animal-fish')).toBeNull();
  const bestAnimal = screen.getByTestId('results-table-best-animal-mammal');
  within(bestAnimal).getByText(/1 ballot cast/);
  within(bestAnimal).getByText(/0 overvotes/);
  within(bestAnimal).getByText(/0 undervotes/);
  within(screen.getByTestId('best-animal-mammal-otter')).getByText('1');
  within(screen.getByTestId('best-animal-mammal-horse')).getByText('0');
  within(screen.getByTestId('best-animal-mammal-fox')).getByText('0');
  expect(within(bestAnimal).queryByText('Write-In')).toBeNull();

  const zooCouncil = screen.getByTestId('results-table-zoo-council-mammal');
  within(zooCouncil).getByText(/1 ballot cast/);
  within(zooCouncil).getByText(/0 overvotes/);
  within(zooCouncil).getByText(/1 undervote/);
  within(screen.getByTestId('zoo-council-mammal-zebra')).getByText('1');
  within(screen.getByTestId('zoo-council-mammal-lion')).getByText('0');
  within(screen.getByTestId('zoo-council-mammal-kangaroo')).getByText('0');
  within(screen.getByTestId('zoo-council-mammal-elephant')).getByText('1');
  within(screen.getByTestId('zoo-council-mammal-write-in')).getByText('0');
  expect(within(zooCouncil).queryByText('Write-In')).toBeDefined();
});

const primaryCvr2: CastVoteRecord = {
  _precinctId: 'precinct-1',
  _ballotId: unsafeParse(BallotIdSchema, 'test-123'),
  _ballotStyleId: '1F',
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'best-animal-fish': ['seahorse'],
  'aquarium-council-fish': ['pufferfish'],
  fishing: ['yes', 'no'],
};

test('renders as expected for a single precincts in a primary election', () => {
  const party1 = unsafeParse(PartyIdSchema, '1');
  const tally = filterTallyContestsByParty(
    electionMinimalExhaustiveSample,
    calculateTallyForCastVoteRecords(
      electionMinimalExhaustiveSample,
      new Set([primaryCvr2])
    ),
    party1
  );
  render(
    <PrecinctScannerTallyReport
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      precinctSelection={singlePrecinctSelectionFor('precinct-1')}
      pollsTransition="close_polls"
      isLiveMode
      tally={tally}
      partyId={party1}
    />
  );
  screen.getByText('Official Polls Closed Report for Precinct 1');
  const electionTitle = screen.getByText(
    'Fish Party Example Primary Election:'
  );
  expect(electionTitle.parentElement).toHaveTextContent(
    'Fish Party Example Primary Election: Wednesday, September 8, 2021, Sample County, State of Sample'
  );
  const eventDate = screen.getByText('Polls Closed:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Closed: Sep 19, 2021, 11:05 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06 AM'
  );
  expect(screen.queryByTestId('results-table-best-animal-mammal')).toBeNull();
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
  expect(screen.queryByTestId('results-table-best-animal-mammal')).toBeNull();
  const bestAnimal = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimal).getByText(/1 ballot cast/);
  within(bestAnimal).getByText(/0 overvotes/);
  within(bestAnimal).getByText(/0 undervotes/);
  within(screen.getByTestId('best-animal-fish-seahorse')).getByText('1');
  within(screen.getByTestId('best-animal-fish-salmon')).getByText('0');
  expect(within(bestAnimal).queryByText('Write-In')).toBeNull();

  const zooCouncil = screen.getByTestId('results-table-aquarium-council-fish');
  within(zooCouncil).getByText(/1 ballot cast/);
  within(zooCouncil).getByText(/0 overvotes/);
  within(zooCouncil).getByText(/1 undervote/);
  within(screen.getByTestId('aquarium-council-fish-manta-ray')).getByText('0');
  within(screen.getByTestId('aquarium-council-fish-pufferfish')).getByText('1');
  within(screen.getByTestId('aquarium-council-fish-rockfish')).getByText('0');
  within(screen.getByTestId('aquarium-council-fish-triggerfish')).getByText(
    '0'
  );
  within(screen.getByTestId('aquarium-council-fish-write-in')).getByText('0');
  expect(within(zooCouncil).queryByText('Write-In')).toBeDefined();
});
