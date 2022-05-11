import React from 'react';

import {
  asElectionDefinition,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import {
  CandidateContestWithoutWriteInsCompressedTally,
  CandidateContestWithWriteInsCompressedTally,
  CompressedTally,
  ContestId,
  Dictionary,
  MsEitherNeitherContestCompressedTally,
  YesNoContestCompressedTally,
} from '@votingworks/types';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  TallySourceMachineType,
  PrecinctScannerCardTally,
  typedAs,
  MemoryHardware,
} from '@votingworks/utils';
import { getZeroCompressedTally } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { PrecinctSelectionKind, MarkOnly, PrintOnly } from '../config/types';

import { render } from '../../test/test_utils';

import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { fakePrinter } from '../../test/helpers/fake_printer';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import { electionSampleWithSealDefinition } from '../data';

const electionSampleWithSeal = electionSampleWithSealDefinition.election;

beforeEach(() => {
  jest.useFakeTimers();
});

function renderScreen(props: Partial<PollworkerScreenProps> = {}) {
  return render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={electionSampleWithSealDefinition}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: MarkOnly })}
      hardware={MemoryHardware.buildStandard()}
      devices={fakeDevices()}
      screenReader={new AriaScreenReader(fakeTts())}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
      reload={jest.fn()}
      {...props}
    />
  );
}

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
  {
    undervotes,
    overvotes,
    ballotsCast,
  }: {
    undervotes: number;
    overvotes: number;
    ballotsCast: number;
  },
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

test('renders PollWorkerScreen', () => {
  renderScreen();
  screen.getByText(/Polls are currently open./);
});

test('switching out of test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Switch to Live Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', () => {
  renderScreen({ isLiveMode: true });
  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull();
});

test('printing precinct scanner report works as expected with all precinct data for general election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const existingTally = getZeroCompressedTally(electionSampleWithSeal);
  // add tallies to the president contest
  existingTally[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>([
    6 /* undervotes */, 0 /* overvotes */, 34 /* ballotsCast */,
    6 /* for 'barchi-hallaren' */, 5 /* for 'cramer-vuocolo' */,
    6 /* for 'court-blumhardt' */, 5 /* for 'boone-lian' */,
    3 /* for 'hildebrand-garritty' */, 0 /* for 'patterson-lariviere' */,
  ]);
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

  renderScreen({
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

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
  expectContestResultsInReport(
    allPrecinctsReports[0],
    'president',
    { ballotsCast: 34, undervotes: 6, overvotes: 0 },
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

test('printing precinct scanner report works as expected with single precinct data for general election', async () => {
  const election = electionSampleWithSeal;
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const existingTally = getZeroCompressedTally(election);
  // add tallies to the president contest
  existingTally[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>([
    6 /* undervotes */, 0 /* overvotes */, 34 /* ballotsCast */,
    6 /* for 'barchi-hallaren' */, 5 /* for 'cramer-vuocolo' */,
    6 /* for 'court-blumhardt' */, 5 /* for 'boone-lian' */,
    3 /* for 'hildebrand-garritty' */, 0 /* for 'patterson-lariviere' */,
  ]);
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

  renderScreen({
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

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
    {
      ballotsCast: 34,
      undervotes: 6,
      overvotes: 0,
    },
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
  // add tallies to the president contest
  centerSpringfield[0] =
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      1 /* undervotes */, 1 /* overvotes */, 10 /* ballotsCast */,
      4 /* for 'barchi-hallaren' */, 2 /* for 'cramer-vuocolo' */,
      1 /* for 'court-blumhardt' */, 1 /* for 'boone-lian' */,
      0 /* for 'hildebrand-garritty' */, 0 /* for 'patterson-lariviere' */,
    ]);
  // add tallies to the president contest
  northSpringfield[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>(
    [
      2 /* undervotes */, 3 /* overvotes */, 15 /* ballotsCast */,
      4 /* for 'barchi-hallaren' */, 2 /* for 'cramer-vuocolo' */,
      1 /* for 'court-blumhardt' */, 1 /* for 'boone-lian' */,
      1 /* for 'hildebrand-garritty' */, 1 /* for 'patterson-lariviere' */,
    ]
  );
  combinedTally[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>([
    3 /* undervotes */, 4 /* overvotes */, 25 /* ballotsCast */,
    8 /* for 'barchi-hallaren' */, 4 /* for 'cramer-vuocolo' */,
    2 /* for 'court-blumhardt' */, 2 /* for 'boone-lian' */,
    1 /* for 'hildebrand-garritty' */, 1 /* for 'patterson-lariviere' */,
  ]);
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

  renderScreen({
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

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
    {
      ballotsCast: 10,
      undervotes: 1,
      overvotes: 1,
    },
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
    {
      ballotsCast: 15,
      undervotes: 2,
      overvotes: 3,
    },
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
    {
      ballotsCast: 0,
      undervotes: 0,
      overvotes: 0,
    },
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
    // best animal mammal
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 1 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'horse' */, 1 /* for 'otter' */, 0 /* for 'fox' */,
      0 /* writeIns */,
    ]),
    // best animal fish
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'seahorse' */, 0 /* for 'salmon' */, 0 /* writeIns */,
    ]),
    // zoo council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      3 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      1 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
      1 /* for 'elephant' */, 1 /* writeIns */,
    ]),
    // aquarium council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'manta-ray' */, 0 /* for 'pufferfish' */, 0 /* for 'rockfish' */,
      1 /* for 'triggerfish' */, 0 /* writeIns */,
    ]),
    // new zoo either neither
    typedAs<MsEitherNeitherContestCompressedTally>([
      2 /* eitherOption */, 0 /* neitherOption */,
      0 /* eitherNeitherUndervotes */, 0 /* eitherNeitherOvervotes */,
      0 /* firstOption */, 1 /* secondOption */, 1 /* pickOneUndervotes */,
      0 /* pickOneOvervotes */, 2 /* ballotsCast */,
    ]),
    // fishing ban yes no
    typedAs<YesNoContestCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      0 /* for 'yes' */, 1 /* for 'no' */,
    ]),
  ];
  const talliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      // best animal mammal
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'horse' */, 1 /* for 'otter' */, 0 /* for 'fox' */,
        0 /* writeIns */,
      ]),
      // best animal fish
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 0 /* ballotsCast */,
        0 /* for 'seahorse' */, 0 /* for 'salmon' */, 0 /* writeIns */,
      ]),
      // zoo council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
        0 /* for 'elephant' */, 1 /* writeIns */,
      ]),
      // aquarium council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 0 /* ballotsCast */,
        0 /* for 'manta-ray' */, 0 /* for 'pufferfish' */,
        0 /* for 'rockfish' */, 0 /* for 'triggerfish' */, 0 /* writeIns */,
      ]),
      // new zoo either neither
      typedAs<MsEitherNeitherContestCompressedTally>([
        1 /* eitherOption */, 0 /* neitherOption */,
        0 /* eitherNeitherUndervotes */, 0 /* eitherNeitherOvervotes */,
        0 /* firstOption */, 0 /* secondOption */, 1 /* pickOneUndervotes */,
        0 /* pickOneOvervotes */, 1 /* ballotsCast */,
      ]),
      // fishing ban yes no
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 0 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
    ],
    'precinct-2': [
      // best animal mammal
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 1 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'horse' */, 0 /* for 'otter' */, 0 /* for 'fox' */,
      ]),
      // best animal fish
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'seahorse' */, 0 /* for 'salmon' */,
      ]),
      // zoo council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        2 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
        1 /* for 'elephant' */, 1 /* writeIns */,
      ]),
      // aquarium council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'manta-ray' */, 0 /* for 'pufferfish' */,
        0 /* for 'rockfish' */, 1 /* for 'triggerfish' */, 0 /* writeIns */,
      ]),
      // new zoo either neither
      typedAs<MsEitherNeitherContestCompressedTally>([
        1 /* eitherOption */, 0 /* neitherOption */,
        0 /* eitherNeitherUndervotes */, 0 /* eitherNeitherOvervotes */,
        0 /* firstOption */, 1 /* secondOption */, 0 /* pickOneUndervotes */,
        0 /* pickOneOvervotes */, 1 /* ballotsCast */,
      ]),
      // fishing ban yes no
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 1 /* for 'no' */,
      ]),
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

  renderScreen({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    appPrecinct: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: 'precinct-1',
    },
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const precinct1MammalReports = screen.getAllByTestId(
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
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'zoo-council-mammal',
    {
      ballotsCast: 1,
      undervotes: 1,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 0, 'write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-either',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-pick',
    {
      ballotsCast: 1,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 0 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const precinct1FishReports = screen.getAllByTestId(
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
    {
      ballotsCast: 0,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 0, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReports[0],
    'aquarium-council-fish',
    {
      ballotsCast: 0,
      undervotes: 0,
      overvotes: 0,
    },
    {
      'manta-ray': 0,
      pufferfish: 0,
      rockfish: 0,
      triggerfish: 0,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(
    precinct1FishReports[0],
    'fishing',
    { ballotsCast: 0, undervotes: 0, overvotes: 0 },
    { yes: 0, no: 0 }
  );
  // Check that the expected results are on the tally report for Precinct 2 Mammal Party
  const precinct2MammalReports = screen.getAllByTestId(
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
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 0, fox: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'zoo-council-mammal',
    {
      ballotsCast: 1,
      undervotes: 2,
      overvotes: 0,
    },
    { zebra: 0, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'new-zoo-either',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReports[0],
    'new-zoo-pick',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 2 Fish Party
  const precinct2FishReports = screen.getAllByTestId(
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
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct2FishReports[0],
    'aquarium-council-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    {
      'manta-ray': 1,
      pufferfish: 0,
      rockfish: 0,
      triggerfish: 1,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(
    precinct2FishReports[0],
    'fishing',
    { ballotsCast: 1, undervotes: 0, overvotes: 0 },
    { yes: 0, no: 1 }
  );
});

test('printing precinct scanner report works as expected with all precinct combined data for primary election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const combinedTally: CompressedTally = [
    // best animal mammal
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 1 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'horse' */, 1 /* for 'otter' */, 0 /* for 'fox' */,
    ]),
    // best animal fish
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'seahorse' */, 0 /* for 'salmon' */,
    ]),
    // zoo council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      3 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      1 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
      1 /* for 'elephant' */, 1 /* writeIns */,
    ]),
    // aquarium council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'manta-ray' */, 0 /* for 'pufferfish' */, 0 /* for 'rockfish' */,
      1 /* for 'triggerfish' */, 0 /* writeIns */,
    ]),
    // new zoo either neither
    typedAs<MsEitherNeitherContestCompressedTally>([
      2 /* eitherOption */, 0 /* neitherOption */,
      0 /* eitherNeitherUndervotes */, 0 /* eitherNeitherOvervotes */,
      0 /* firstOption */, 1 /* secondOption */, 1 /* pickOneUndervotes */,
      0 /* pickOneOvervotes */, 2 /* ballotsCast */,
    ]),
    // fishing ban yes no
    typedAs<YesNoContestCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      0 /* for 'yes' */, 1 /* for 'no' */,
    ]),
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

  renderScreen({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    appPrecinct: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: 'precinct-1',
    },
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReports = screen.getAllByTestId(
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
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'zoo-council-mammal',
    {
      ballotsCast: 2,
      undervotes: 3,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-either',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-pick',
    {
      ballotsCast: 2,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReports = screen.getAllByTestId(
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
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'aquarium-council-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    {
      'manta-ray': 1,
      pufferfish: 0,
      rockfish: 0,
      triggerfish: 1,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'fishing',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
});

test('printing precinct scanner report works as expected with a single precinct for primary election', async () => {
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const combinedTally: CompressedTally = [
    // best animal mammal
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 1 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'horse' */, 1 /* for 'otter' */, 0 /* for 'fox' */,
    ]),
    // best animal fish
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'seahorse' */, 0 /* for 'salmon' */,
    ]),
    // zoo council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      3 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      1 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
      1 /* for 'elephant' */, 1 /* writeIns */,
    ]),
    // aquarium council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      1 /* for 'manta-ray' */, 0 /* for 'pufferfish' */, 0 /* for 'rockfish' */,
      1 /* for 'triggerfish' */, 0 /* writeIns */,
    ]),
    // new zoo either neither
    typedAs<MsEitherNeitherContestCompressedTally>([
      2 /* eitherOption */, 0 /* neitherOption */,
      0 /* eitherNeitherUndervotes */, 0 /* eitherNeitherOvervotes */,
      0 /* firstOption */, 1 /* secondOption */, 1 /* pickOneUndervotes */,
      0 /* pickOneOvervotes */, 2 /* ballotsCast */,
    ]),
    // fishing ban yes no
    typedAs<YesNoContestCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
      0 /* for 'yes' */, 1 /* for 'no' */,
    ]),
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

  renderScreen({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    appPrecinct: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: 'precinct-1',
    },
    isLiveMode: true,
    isPollsOpen: false,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
    printer: { ...fakePrinter(), print: printFn },
    tallyOnCard,
    clearTalliesOnCard: clearTallies,
  });

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReports = screen.getAllByTestId(
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
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'zoo-council-mammal',
    {
      ballotsCast: 2,
      undervotes: 3,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-either',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReports[0],
    'new-zoo-pick',
    {
      ballotsCast: 2,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReports = screen.getAllByTestId(
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
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'aquarium-council-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    {
      'manta-ray': 1,
      pufferfish: 0,
      rockfish: 0,
      triggerfish: 1,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(
    allPrecinctFishReports[0],
    'fishing',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
});

test('navigates to System Diagnostics screen', () => {
  const { unmount } = renderScreen();

  userEvent.click(screen.getByRole('button', { name: 'System Diagnostics' }));
  screen.getByRole('heading', { name: 'System Diagnostics' });

  userEvent.click(screen.getByRole('button', { name: 'Back' }));
  screen.getByRole('heading', { name: 'Open/Close Polls' });

  // Explicitly unmount before the printer status has resolved to verify that
  // we properly cancel the request for printer status.
  unmount();
});
