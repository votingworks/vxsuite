import React from 'react';
import {
  asElectionDefinition,
  electionMinimalExhaustiveSampleDefintion,
} from '@votingworks/fixtures';
import {
  CompressedTally,
  ContestId,
  Dictionary,
  Election,
  safeParseElection,
} from '@votingworks/types';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  TallySourceMachineType,
  PrecinctScannerCardTally,
} from '@votingworks/utils';
import { getZeroCompressedTally } from '@votingworks/test-utils';
import {
  PrecinctSelectionKind,
  VxMarkOnly,
  VxPrintOnly,
} from '../config/types';

import { render } from '../../test/testUtils';

import electionSampleWithSealUntyped from '../data/electionSampleWithSeal.json';
import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen } from './PollWorkerScreen';
import { fakePrinter } from '../../test/helpers/fakePrinter';
import { fakeMachineConfig } from '../../test/helpers/fakeMachineConfig';

const electionSampleWithSeal = safeParseElection(
  electionSampleWithSealUntyped
).unsafeUnwrap();

beforeEach(() => {
  jest.useFakeTimers();
});

function expectBallotCountsInReport(
  container: HTMLElement,
  precinctBallots: number,
  absenteeBallots: number,
  totalBallots: number
): void {
  const table = within(container).getByTestId('voting-method-table');
  within(within(table).getByTestId('standard')).getByText(precinctBallots);
  within(within(table).getByTestId('absentee')).getByText(absenteeBallots);
  within(within(table).getByTestId('total')).getByText(totalBallots);
}

function expectContestResultsInReport(
  container: HTMLElement,
  contestId: ContestId,
  ballotsCast: number,
  undervotes: number,
  overvotes: number,
  options: Dictionary<number>
): void {
  const table = within(container).getByTestId(`results-table-${contestId}`);
  within(table).getByText(
    new RegExp(`${ballotsCast} ballot${ballotsCast === 1 ? '' : 's'} cast`)
  );
  within(table).getByText(new RegExp(`${undervotes} undervote`));
  within(table).getByText(new RegExp(`${overvotes} overvote`));
  for (const [optionId, tally] of Object.entries(options)) {
    if (tally) {
      within(within(table).getByTestId(`${contestId}-${optionId}`)).getByText(
        tally
      );
    }
  }
}

test('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal;
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
      reload={jest.fn()}
    />
  );

  screen.getByText(/Polls are currently open./);
});

test('switching out of test mode on election day', async () => {
  const election: Election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  };
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
      reload={jest.fn()}
    />
  );

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Switch to Live Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', async () => {
  const election: Election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  };
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
      reload={jest.fn()}
    />
  );

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', async () => {
  const election = electionSampleWithSeal;
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
      reload={jest.fn()}
    />
  );

  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull();
});

test('printing precinct scanner report works as expected with all precinct data for general election', async () => {
  const election = electionSampleWithSeal;
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const existingTally = getZeroCompressedTally(election);
  existingTally[0] = [6, 0, 34, 6, 5, 6, 5, 3, 0, 3]; // add tallies to the president contest
  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: { 'undefined,__ALL_PRECINCTS': [20, 5] },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  const allPrecinctsReports = screen.getAllByTestId(
    'tally-report-undefined-undefined'
  );
  expect(allPrecinctsReports).toHaveLength(2);
  expectBallotCountsInReport(allPrecinctsReports[0], 20, 5, 25);
  expectContestResultsInReport(allPrecinctsReports[0], 'president', 34, 6, 0, {
    'barchi-hallaren': 6,
    'cramer-vuocolo': 5,
    'court-blumhardt': 6,
    'boone-lian': 5,
    'hildebrand-garritty': 3,
    'patterson-lariviere': 0,
  });
  const senatorContest = screen.getAllByTestId('results-table-senator')[0];
  within(senatorContest).getByText(/0 ballots/);
  within(senatorContest).getByText(/0 undervotes/);
  within(senatorContest).getByText(/0 overvotes/);
  expect(within(senatorContest).getAllByText('0')).toHaveLength(7); // All 7 candidates should have 0 totals
});

test('printing precinct scanner report works as expected with single precinct data for general election', async () => {
  const election = electionSampleWithSeal;
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const existingTally = getZeroCompressedTally(election);
  existingTally[0] = [6, 0, 34, 6, 5, 6, 5, 3, 0, 3]; // add tallies to the president contest
  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    talliesByPrecinct: { '23': existingTally },
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: '23',
    },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [20, 5],
    },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  const centerSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-23'
  );
  expect(centerSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(centerSpringfieldReports[0], 20, 5, 25);
  expectContestResultsInReport(
    centerSpringfieldReports[0],
    'president',
    34,
    6,
    0,
    {
      'barchi-hallaren': 6,
      'cramer-vuocolo': 5,
      'court-blumhardt': 6,
      'boone-lian': 5,
      'hildebrand-garritty': 3,
      'patterson-lariviere': 0,
    }
  );
  const senatorContest = screen.getAllByTestId('results-table-senator')[0];
  within(senatorContest).getByText(/0 ballots/);
  within(senatorContest).getByText(/0 undervotes/);
  within(senatorContest).getByText(/0 overvotes/);
  expect(within(senatorContest).getAllByText('0')).toHaveLength(7); // All 7 candidates should have 0 totals
});

test('printing precinct scanner report works as expected with all precinct specific data for general election', async () => {
  const election = electionSampleWithSeal;
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const centerSpringfield = getZeroCompressedTally(election);
  const northSpringfield = getZeroCompressedTally(election);
  const southSpringfield = getZeroCompressedTally(election);
  const combinedTally = getZeroCompressedTally(election);
  centerSpringfield[0] = [1, 1, 10, 4, 2, 1, 1, 0, 0, 0]; // add tallies to the president contest
  northSpringfield[0] = [2, 3, 15, 4, 2, 1, 1, 1, 1, 0]; // add tallies to the president contest
  combinedTally[0] = [3, 4, 25, 8, 4, 2, 2, 1, 1, 0];
  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: combinedTally,
    talliesByPrecinct: {
      23: centerSpringfield,
      21: northSpringfield,
      20: southSpringfield,
    },
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: '23',
    },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [10, 0],
      'undefined,21': [10, 5],
      'undefined,20': [0, 0],
    },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  const centerSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-23'
  );
  expect(centerSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(centerSpringfieldReports[0], 10, 0, 10);
  expectContestResultsInReport(
    centerSpringfieldReports[0],
    'president',
    10,
    1,
    1,
    {
      'barchi-hallaren': 4,
      'cramer-vuocolo': 2,
      'court-blumhardt': 1,
      'boone-lian': 1,
      'hildebrand-garritty': 0,
      'patterson-lariviere': 0,
    }
  );

  const northSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-21'
  );
  expect(northSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(northSpringfieldReports[0], 10, 5, 15);
  expectContestResultsInReport(
    northSpringfieldReports[0],
    'president',
    15,
    2,
    3,
    {
      'barchi-hallaren': 4,
      'cramer-vuocolo': 2,
      'court-blumhardt': 1,
      'boone-lian': 1,
      'hildebrand-garritty': 1,
      'patterson-lariviere': 1,
    }
  );

  const southSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-20'
  );
  expect(southSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(southSpringfieldReports[0], 0, 0, 0);
  expectContestResultsInReport(
    southSpringfieldReports[0],
    'president',
    0,
    0,
    0,
    {
      'barchi-hallaren': 0,
      'cramer-vuocolo': 0,
      'court-blumhardt': 0,
      'boone-lian': 0,
      'hildebrand-garritty': 0,
      'patterson-lariviere': 0,
    }
  );
});

test('printing precinct scanner report works as expected with all precinct specific data for primary election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const combinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [2, 0, 0, 0, 0, 1, 1, 0, 2], // new zoo either neither
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];
  const talliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      [0, 0, 1, 0, 1, 0, 0], // best animal mammal
      [0, 0, 0, 0, 0, 0], // best animal fish
      [1, 0, 1, 1, 0, 0, 0, 1], // zoo council
      [0, 0, 0, 0, 0, 0, 0, 0], // aquarium council
      [1, 0, 0, 0, 0, 0, 1, 0, 1], // new zoo either neither
      [0, 0, 0, 0, 0], // fishing ban yes no
    ],
    'precinct-2': [
      [0, 1, 1, 0, 0, 0, 0], // best animal mammal
      [0, 0, 1, 1, 0, 0], // best animal fish
      [2, 0, 1, 0, 0, 0, 1, 0], // zoo council
      [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
      [1, 0, 0, 0, 0, 1, 0, 0, 1], // new zoo either neither
      [0, 0, 1, 0, 1], // fishing ban yes no
    ],
  };

  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: combinedTally,
    talliesByPrecinct,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: {
      kind: PrecinctSelectionKind.AllPrecincts,
    },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 0],
      '0,precinct-2': [0, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [0, 0],
      '1,precinct-2': [1, 0],
    },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      }}
      electionDefinition={electionMinimalExhaustiveSampleDefintion}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const precinct1MammalReports = await screen.getAllByTestId(
    'tally-report-0-precinct-1'
  );
  expect(precinct1MammalReports).toHaveLength(2);
  expectBallotCountsInReport(precinct1MammalReports[0], 1, 0, 1);
  expect(
    within(precinct1MammalReports[0]).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'best-animal-mammal',
    1,
    0,
    0,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'zoo-council-mammal',
    1,
    1,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 0, '__write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-either',
    1,
    0,
    0,
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-pick',
    1,
    1,
    0,
    { yes: 0, no: 0 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const precinct1FishReports = await screen.getAllByTestId(
    'tally-report-1-precinct-1'
  );
  expect(precinct1FishReports).toHaveLength(2);
  expectBallotCountsInReport(precinct1FishReports[0], 0, 0, 0);
  expect(
    within(precinct1FishReports[0]).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1FishReports[0],
    'best-animal-fish',
    0,
    0,
    0,
    { seahorse: 0, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReports[0],
    'aquarium-council-fish',
    0,
    0,
    0,
    {
      'manta-ray': 0,
      pufferfish: 0,
      triggerfish: 0,
      rockfish: 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(precinct1FishReports[0], 'fishing', 0, 0, 0, {
    yes: 0,
    no: 0,
  });
  // Check that the expected results are on the tally report for Precinct 2 Mammal Party
  const precinct2MammalReports = await screen.getAllByTestId(
    'tally-report-0-precinct-2'
  );
  expect(precinct2MammalReports).toHaveLength(2);
  expectBallotCountsInReport(precinct2MammalReports[0], 0, 1, 1);
  expect(
    within(precinct2MammalReports[0]).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'best-animal-mammal',
    1,
    0,
    1,
    { horse: 0, otter: 0, fox: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'zoo-council-mammal',
    1,
    2,
    0,
    { zebra: 0, lion: 0, kangaroo: 0, elephant: 1, '__write-in': 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'new-zoo-either',
    1,
    0,
    0,
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'new-zoo-pick',
    1,
    0,
    0,
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 2 Fish Party
  const precinct2FishReports = await screen.getAllByTestId(
    'tally-report-1-precinct-2'
  );
  expect(precinct2FishReports).toHaveLength(2);
  expectBallotCountsInReport(precinct2FishReports[0], 1, 0, 1);
  expect(
    within(precinct2FishReports[0]).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct2FishReports[0],
    'best-animal-fish',
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct2FishReports[0],
    'aquarium-council-fish',
    1,
    0,
    0,
    {
      'manta-ray': 1,
      pufferfish: 0,
      triggerfish: 1,
      rockfish: 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(precinct2FishReports[0], 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });
});

test('printing precinct scanner report works as expected with all precinct combined data for primary election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const combinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [2, 0, 0, 0, 0, 1, 1, 0, 2], // new zoo either neither
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];

  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: combinedTally,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: {
      kind: PrecinctSelectionKind.AllPrecincts,
    },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 0],
      '0,precinct-2': [0, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [0, 0],
      '1,precinct-2': [1, 0],
    },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      }}
      electionDefinition={electionMinimalExhaustiveSampleDefintion}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReports = await screen.getAllByTestId(
    'tally-report-0-undefined'
  );
  expect(allPrecinctMammalReports).toHaveLength(2);
  expectBallotCountsInReport(allPrecinctMammalReports[0], 1, 1, 2);
  expect(
    within(allPrecinctMammalReports[0]).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'best-animal-mammal',
    2,
    0,
    1,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'zoo-council-mammal',
    2,
    3,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, '__write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-either',
    2,
    0,
    0,
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-pick',
    2,
    1,
    0,
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReports = await screen.getAllByTestId(
    'tally-report-1-undefined'
  );
  expect(allPrecinctFishReports).toHaveLength(2);
  expectBallotCountsInReport(allPrecinctFishReports[0], 1, 0, 1);
  expect(
    within(allPrecinctFishReports[0]).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'best-animal-fish',
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'aquarium-council-fish',
    1,
    0,
    0,
    {
      'manta-ray': 1,
      pufferfish: 0,
      triggerfish: 1,
      rockfish: 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(allPrecinctFishReports[0], 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });
});

test('printing precinct scanner report works as expected with a single precinct for primary election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const combinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [2, 0, 0, 0, 0, 1, 1, 0, 2], // new zoo either neither
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];

  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: combinedTally,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: 'precinct-1',
    },
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [1, 0],
    },
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      }}
      electionDefinition={electionMinimalExhaustiveSampleDefintion}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
      reload={jest.fn()}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReports = await screen.getAllByTestId(
    'tally-report-0-precinct-1'
  );
  expect(allPrecinctMammalReports).toHaveLength(2);
  expectBallotCountsInReport(allPrecinctMammalReports[0], 1, 1, 2);
  expect(
    within(allPrecinctMammalReports[0]).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'best-animal-mammal',
    2,
    0,
    1,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'zoo-council-mammal',
    2,
    3,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, '__write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-either',
    2,
    0,
    0,
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-pick',
    2,
    1,
    0,
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReports = await screen.getAllByTestId(
    'tally-report-1-precinct-1'
  );
  expect(allPrecinctFishReports).toHaveLength(2);
  expectBallotCountsInReport(allPrecinctFishReports[0], 1, 0, 1);
  expect(
    within(allPrecinctFishReports[0]).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'best-animal-fish',
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'aquarium-council-fish',
    1,
    0,
    0,
    {
      'manta-ray': 1,
      pufferfish: 0,
      triggerfish: 1,
      rockfish: 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(allPrecinctFishReports[0], 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });
});
