import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  electionMinimalExhaustiveSampleDefintion,
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { CastVoteRecord, PrecinctSelectionKind } from '@votingworks/types';
import { calculateTallyForCastVoteRecords } from '@votingworks/utils';

import { PrecinctScannerTallyReport } from './PrecinctScannerTallyReport';

afterEach(() => {
  window.kiosk = undefined;
});

const time = new Date(2021, 8, 19, 11, 5).getTime();
const cvr: CastVoteRecord = {
  _precinctId: electionSample.precincts[0].id,
  _ballotId: 'test-123',
  _ballotStyleId: electionSample.ballotStyles[0].id,
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'county-commissioners': ['argent'],
};

test('renders as expected for all precincts in a general election', async () => {
  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  render(
    <PrecinctScannerTallyReport
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      precinctSelection={{ kind: PrecinctSelectionKind.AllPrecincts }}
      reportPurpose="Testing"
      isPollsOpen={false}
      tally={tally}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('All Precincts Polls Closed Tally Report');
  screen.getByText('General Election');
  screen.getByText(
    /Polls Closed and report created on Sun, Sep 19, 2021, 11:05 AM/
  );
  const countyCommissioners = screen.getByTestId(
    'results-table-county-commissioners'
  );
  within(countyCommissioners).getByText(/1 ballot cast/);
  within(countyCommissioners).getByText(/0 overvotes/);
  within(countyCommissioners).getByText(/3 undervotes/);
  within(screen.getByTestId('county-commissioners-argent')).getByText('1');
  within(
    screen.getByTestId('county-commissioners-witherspoonsmithson')
  ).getByText('0');
  within(screen.getByTestId('county-commissioners-bainbridge')).getByText('0');

  within(screen.getByTestId('results-table-president')).getByText(
    /0 ballots cast/
  );
  within(
    screen.getByTestId('results-table-judicial-robert-demergue')
  ).getByText(/0 ballots cast/);
});

test('renders as expected for a single precinct in a general election', async () => {
  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  render(
    <PrecinctScannerTallyReport
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: electionSample.precincts[0].id,
      }}
      reportPurpose="Testing"
      isPollsOpen
      tally={tally}
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Center Springfield Polls Opened Tally Report');
  screen.getByText('General Election');
  screen.getByText(
    /Polls Opened and report created on Sun, Sep 19, 2021, 11:05 AM/
  );
  const countyCommissioners = screen.getByTestId(
    'results-table-county-commissioners'
  );
  within(countyCommissioners).getByText(/1 ballot cast/);
  within(countyCommissioners).getByText(/0 overvotes/);
  within(countyCommissioners).getByText(/3 undervotes/);
  within(screen.getByTestId('county-commissioners-argent')).getByText('1');
  within(
    screen.getByTestId('county-commissioners-witherspoonsmithson')
  ).getByText('0');
  within(screen.getByTestId('county-commissioners-bainbridge')).getByText('0');

  within(screen.getByTestId('results-table-president')).getByText(
    /0 ballots cast/
  );
  within(
    screen.getByTestId('results-table-judicial-robert-demergue')
  ).getByText(/0 ballots cast/);
});

const primaryCVR: CastVoteRecord = {
  _precinctId: 'precinct-1',
  _ballotId: 'test-123',
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

test('renders as expected for all precincts in a primary election', async () => {
  const tally = calculateTallyForCastVoteRecords(
    electionMinimalExhaustiveSampleDefintion.election,
    new Set([primaryCVR]),
    '0'
  );
  render(
    <PrecinctScannerTallyReport
      reportSavedTime={time}
      electionDefinition={electionMinimalExhaustiveSampleDefintion}
      precinctSelection={{
        kind: PrecinctSelectionKind.AllPrecincts,
      }}
      reportPurpose="Testing"
      isPollsOpen
      tally={tally}
      partyId="0"
    />
  );
  screen.getByText('All Precincts Polls Opened Tally Report');
  screen.getByText('Mammal Party Example Primary Election');
  screen.getByText(
    /Polls Opened and report created on Sun, Sep 19, 2021, 11:05 AM/
  );
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
  within(screen.getByTestId('zoo-council-mammal-__write-in')).getByText('0');
  expect(within(zooCouncil).queryByText('Write-In')).toBeDefined();

  const eitherNeiher = screen.getByTestId('results-table-new-zoo-either');
  within(eitherNeiher).getByText(/1 ballot cast/);
  within(eitherNeiher).getByText(/0 overvotes/);
  within(eitherNeiher).getByText(/0 undervotes/);
  within(screen.getByTestId('new-zoo-either-yes')).getByText('1');
  within(screen.getByTestId('new-zoo-either-no')).getByText('0');
  const pickOne = screen.getByTestId('results-table-new-zoo-pick');
  within(pickOne).getByText(/1 ballot cast/);
  within(pickOne).getByText(/0 overvotes/);
  within(pickOne).getByText(/0 undervotes/);
  within(screen.getByTestId('new-zoo-pick-yes')).getByText('0');
  within(screen.getByTestId('new-zoo-pick-no')).getByText('1');
});

const primaryCVR2: CastVoteRecord = {
  _precinctId: 'precinct-1',
  _ballotId: 'test-123',
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

test('renders as expected for a single precincts in a primary election', async () => {
  const tally = calculateTallyForCastVoteRecords(
    electionMinimalExhaustiveSampleDefintion.election,
    new Set([primaryCVR2]),
    '1'
  );
  render(
    <PrecinctScannerTallyReport
      reportSavedTime={time}
      electionDefinition={electionMinimalExhaustiveSampleDefintion}
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      }}
      reportPurpose="Testing"
      isPollsOpen={false}
      tally={tally}
      partyId="1"
    />
  );
  screen.getByText('Precinct 1 Polls Closed Tally Report');
  screen.getByText('Fish Party Example Primary Election');
  screen.getByText(
    /Polls Closed and report created on Sun, Sep 19, 2021, 11:05 AM/
  );
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
  within(screen.getByTestId('aquarium-council-fish-__write-in')).getByText('0');
  expect(within(zooCouncil).queryByText('Write-In')).toBeDefined();

  const yesNo = screen.getByTestId('results-table-fishing');
  within(yesNo).getByText(/1 ballot cast/);
  within(yesNo).getByText(/1 overvote/);
  within(yesNo).getByText(/0 undervotes/);
  within(screen.getByTestId('fishing-yes')).getByText('0');
  within(screen.getByTestId('fishing-no')).getByText('0');
});
