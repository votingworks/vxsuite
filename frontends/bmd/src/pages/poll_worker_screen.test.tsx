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
  ElectionDefinition,
  MsEitherNeitherContestCompressedTally,
  ok,
  InsertedSmartcardAuth,
  YesNoContestCompressedTally,
} from '@votingworks/types';

import {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import {
  ALL_PRECINCTS_SELECTION,
  TallySourceMachineType,
  PrecinctScannerCardTally,
  singlePrecinctSelectionFor,
  typedAs,
  MemoryHardware,
} from '@votingworks/utils';
import {
  getZeroCompressedTally,
  Inserted,
  fakePollWorkerUser,
  fakeCardStorage,
  fakePrinter,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { MarkOnly, PrintOnly, MarkAndPrint } from '../config/types';

import { render } from '../../test/test_utils';

import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import {
  electionSampleWithSealDefinition,
  electionSampleWithSealAndReportingUrlDefinition,
} from '../data';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';

const electionSampleWithSeal = electionSampleWithSealDefinition.election;
const electionSampleWithSealAndReportingUrl =
  electionSampleWithSealAndReportingUrlDefinition.election;

beforeEach(() => {
  jest.useFakeTimers();
});

function fakePollworkerAuth(
  electionDefinition: ElectionDefinition,
  tally?: PrecinctScannerCardTally
): InsertedSmartcardAuth.PollWorkerLoggedIn {
  return Inserted.fakePollWorkerAuth(
    fakePollWorkerUser({ electionHash: electionDefinition.electionHash }),
    fakeCardStorage({
      hasStoredData: tally !== undefined,
      readStoredObject: jest.fn().mockResolvedValue(ok(tally)),
    })
  );
}

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn = fakePollworkerAuth(
    electionSampleWithSealDefinition
  ),
  electionDefinition: ElectionDefinition = electionSampleWithSealDefinition
) {
  return render(
    <PollWorkerScreen
      pollworkerAuth={pollworkerAuth}
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
      electionDefinition={electionDefinition}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      ballotsPrintedCount={0}
      machineConfig={fakeMachineConfig({ appMode: MarkOnly })}
      hardware={MemoryHardware.buildStandard()}
      devices={fakeDevices()}
      screenReader={new AriaScreenReader(fakeTts())}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
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

async function printPollsClosedReport() {
  await screen.findByText('Polls Closed Report on Card');
  fireEvent.click(screen.getByText('Close Polls and Print Report'));

  // check that print starts and finishes
  await screen.findByText('Printing polls closed report');
  jest.advanceTimersByTime(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
  await waitForElementToBeRemoved(() =>
    screen.queryByText('Printing polls closed report')
  );
}

test('renders PollWorkerScreen', () => {
  renderScreen();
  screen.getByText('Poll Worker Actions');
  screen.getByText('Ballots Printed:');
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

test('precinct scanner report populated as expected with all precinct data for general election', async () => {
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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: { 'undefined,__ALL_PRECINCTS': [20, 5] },
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealDefinition,
    tallyOnCard
  );

  renderScreen({
    pollworkerAuth,
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  // vxqr is turned off by default
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);

  const allPrecinctsReport = screen.getByTestId(
    'tally-report-undefined-undefined'
  );
  expectBallotCountsInReport(allPrecinctsReport, 20, 5, 25);
  expectContestResultsInReport(
    allPrecinctsReport,
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

test('precinct scanner report with quickresults reporting turned on', async () => {
  const existingTally = getZeroCompressedTally(
    electionSampleWithSealAndReportingUrl
  );
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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: { 'undefined,__ALL_PRECINCTS': [20, 5] },
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealAndReportingUrlDefinition,
    tallyOnCard
  );

  renderScreen(
    {
      pollworkerAuth,
      isLiveMode: true,
      isPollsOpen: true,
      machineConfig: fakeMachineConfig({
        appMode: PrintOnly,
        machineId: '314',
      }),
    },
    pollworkerAuth,
    electionSampleWithSealAndReportingUrlDefinition
  );

  await printPollsClosedReport();

  // vxqr is turned on for this election
  screen.getByText('Automatic Election Results Reporting');
});

test('precinct scanner report populated as expected with single precinct data for general election', async () => {
  const election = electionSampleWithSeal;
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
    precinctSelection: singlePrecinctSelectionFor('23'),
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [20, 5],
    },
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealDefinition,
    tallyOnCard
  );

  renderScreen({
    pollworkerAuth,
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  const centerSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-23'
  );
  expectBallotCountsInReport(centerSpringfieldReport, 20, 5, 25);
  expectContestResultsInReport(
    centerSpringfieldReport,
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

test('precinct scanner report populated as expected with all precinct specific data for general election', async () => {
  const election = electionSampleWithSeal;

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
    precinctSelection: singlePrecinctSelectionFor('23'),
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [10, 0],
      'undefined,21': [10, 5],
      'undefined,20': [0, 0],
    },
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealDefinition,
    tallyOnCard
  );

  renderScreen({
    pollworkerAuth,
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  const centerSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-23'
  );
  expectBallotCountsInReport(centerSpringfieldReport, 10, 0, 10);
  expectContestResultsInReport(
    centerSpringfieldReport,
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

  const northSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-21'
  );
  expectBallotCountsInReport(northSpringfieldReport, 10, 5, 15);
  expectContestResultsInReport(
    northSpringfieldReport,
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

  const southSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-20'
  );
  expectBallotCountsInReport(southSpringfieldReport, 0, 0, 0);
  expectContestResultsInReport(
    southSpringfieldReport,
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

test('precinct scanner report populated as expected with all precinct specific data for primary election', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;

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
    precinctSelection: ALL_PRECINCTS_SELECTION,
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
  const pollworkerAuth = fakePollworkerAuth(electionDefinition, tallyOnCard);

  renderScreen({
    pollworkerAuth,
    electionDefinition,
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const precinct1MammalReport = screen.getByTestId('tally-report-0-precinct-1');
  expectBallotCountsInReport(precinct1MammalReport, 1, 0, 1);
  expect(
    within(precinct1MammalReport).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1MammalReport,
    'best-animal-mammal',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'zoo-council-mammal',
    {
      ballotsCast: 1,
      undervotes: 1,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 0, 'write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'new-zoo-either',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'new-zoo-pick',
    {
      ballotsCast: 1,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 0 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const precinct1FishReport = screen.getByTestId('tally-report-1-precinct-1');
  expectBallotCountsInReport(precinct1FishReport, 0, 0, 0);
  expect(
    within(precinct1FishReport).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1FishReport,
    'best-animal-fish',
    {
      ballotsCast: 0,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 0, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReport,
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
    precinct1FishReport,
    'fishing',
    { ballotsCast: 0, undervotes: 0, overvotes: 0 },
    { yes: 0, no: 0 }
  );
  // Check that the expected results are on the tally report for Precinct 2 Mammal Party
  const precinct2MammalReport = screen.getByTestId('tally-report-0-precinct-2');
  expectBallotCountsInReport(precinct2MammalReport, 0, 1, 1);
  expect(
    within(precinct2MammalReport).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct2MammalReport,
    'best-animal-mammal',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 0, fox: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReport,
    'zoo-council-mammal',
    {
      ballotsCast: 1,
      undervotes: 2,
      overvotes: 0,
    },
    { zebra: 0, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReport,
    'new-zoo-either',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReport,
    'new-zoo-pick',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 2 Fish Party
  const precinct2FishReport = screen.getByTestId('tally-report-1-precinct-2');
  expectBallotCountsInReport(precinct2FishReport, 1, 0, 1);
  expect(
    within(precinct2FishReport).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct2FishReport,
    'best-animal-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct2FishReport,
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
    precinct2FishReport,
    'fishing',
    { ballotsCast: 1, undervotes: 0, overvotes: 0 },
    { yes: 0, no: 1 }
  );
});

test('precinct scanner report populated as expected with all precinct combined data for primary election', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;

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
    precinctSelection: ALL_PRECINCTS_SELECTION,
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
  const pollworkerAuth = fakePollworkerAuth(electionDefinition, tallyOnCard);

  renderScreen({
    pollworkerAuth,
    electionDefinition,
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReport = screen.getByTestId(
    'tally-report-0-undefined'
  );
  expectBallotCountsInReport(allPrecinctMammalReport, 1, 1, 2);
  expect(
    within(allPrecinctMammalReport).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'best-animal-mammal',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'zoo-council-mammal',
    {
      ballotsCast: 2,
      undervotes: 3,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'new-zoo-either',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'new-zoo-pick',
    {
      ballotsCast: 2,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReport = screen.getByTestId('tally-report-1-undefined');
  expectBallotCountsInReport(allPrecinctFishReport, 1, 0, 1);
  expect(
    within(allPrecinctFishReport).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctFishReport,
    'best-animal-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReport,
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
    allPrecinctFishReport,
    'fishing',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
});

test('precinct scanner report populated as expected with a single precinct for primary election', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;

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
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [1, 0],
    },
  };
  const pollworkerAuth = fakePollworkerAuth(electionDefinition, tallyOnCard);

  renderScreen({
    pollworkerAuth,
    electionDefinition,
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
    isLiveMode: true,
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({
      appMode: PrintOnly,
      machineId: '314',
    }),
  });

  await printPollsClosedReport();

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const allPrecinctMammalReport = screen.getByTestId(
    'tally-report-0-precinct-1'
  );
  expectBallotCountsInReport(allPrecinctMammalReport, 1, 1, 2);
  expect(
    within(allPrecinctMammalReport).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'best-animal-mammal',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 1,
    },
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'zoo-council-mammal',
    {
      ballotsCast: 2,
      undervotes: 3,
      overvotes: 0,
    },
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 1 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'new-zoo-either',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctMammalReport,
    'new-zoo-pick',
    {
      ballotsCast: 2,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const allPrecinctFishReport = screen.getByTestId('tally-report-1-precinct-1');
  expectBallotCountsInReport(allPrecinctFishReport, 1, 0, 1);
  expect(
    within(allPrecinctFishReport).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    allPrecinctFishReport,
    'best-animal-fish',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    allPrecinctFishReport,
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
    allPrecinctFishReport,
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
  screen.getByText(hasTextAcrossElements('Polls: Open'));

  // Explicitly unmount before the printer status has resolved to verify that
  // we properly cancel the request for printer status.
  unmount();
});

test('shows instructions to open/close polls on VxScan if no tally report on card', () => {
  const togglePollsOpen = jest.fn();
  renderScreen({
    isPollsOpen: false,
    togglePollsOpen,
  });

  fireEvent.click(screen.getByText('Open Polls for Center Springfield'));

  // Should show the modal and not open/close polls
  expect(togglePollsOpen).not.toHaveBeenCalled();
  screen.getByText('No Polls Opened Report on Card');

  // Clicking Cancel closes the modal
  fireEvent.click(screen.getByText('Cancel'));
  screen.getByText('Open Polls for Center Springfield');

  // Clicking Open VxMark Now should open/close polls anyway
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'));
  fireEvent.click(screen.getByText('Open VxMark Now'));
  expect(togglePollsOpen).toHaveBeenCalled();
});

test('printing polls opened report clears card and opens the polls', async () => {
  const printFn = jest.fn();
  const togglePollsOpen = jest.fn();

  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: getZeroCompressedTally(electionSampleWithSeal),
    totalBallotsScanned: 0,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: false,
    isPollsOpen: true,
    ballotCounts: {},
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealDefinition,
    tallyOnCard
  );

  renderScreen({
    pollworkerAuth,
    isPollsOpen: false,
    togglePollsOpen,
    printer: { ...fakePrinter(), print: printFn },
  });

  // confirm we start with polls closed
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));

  // open the polls
  screen.getByText('Polls Opened Report on Card');
  userEvent.click(
    screen.getByRole('button', { name: 'Open Polls and Print Report' })
  );

  // check that the report was printed
  await waitFor(() => {
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  screen.getByText('Printing polls opened report');
  jest.advanceTimersByTime(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
  await screen.findByText('Polls Opened Report Printed');

  // check that polls were opened
  expect(togglePollsOpen).toHaveBeenCalledTimes(1);

  // check that card was cleared
  expect(pollworkerAuth.card.clearStoredData).toHaveBeenCalledTimes(1);

  // print an additional report
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Report' })
  );
  await waitFor(() => {
    expect(printFn).toHaveBeenCalledTimes(2);
  });
  screen.getByText('Printing polls opened report');
  await screen.findByText('Polls Opened Report Printed');

  // close out flow
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => {
    expect(screen.queryAllByRole('alertdialog').length).toBe(0);
  });
});

test('printing polls closed report clears card and closes the polls', async () => {
  const printFn = jest.fn();
  const togglePollsOpen = jest.fn();

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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: false,
    isPollsOpen: false,
    ballotCounts: { 'undefined,__ALL_PRECINCTS': [20, 5] },
  };
  const pollworkerAuth = fakePollworkerAuth(
    electionSampleWithSealDefinition,
    tallyOnCard
  );

  renderScreen({
    pollworkerAuth,
    isPollsOpen: true,
    togglePollsOpen,
    printer: { ...fakePrinter(), print: printFn },
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Polls: Open'));

  // close the polls
  screen.getByText('Polls Closed Report on Card');
  userEvent.click(
    screen.getByRole('button', { name: 'Close Polls and Print Report' })
  );

  // check that the report was printed
  await waitFor(() => {
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  screen.getByText('Printing polls closed report');
  jest.advanceTimersByTime(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
  await screen.findByText('Polls Closed Report Printed');

  // check that polls were closed
  expect(togglePollsOpen).toHaveBeenCalledTimes(1);

  // check that the card was cleared
  await waitFor(() => {
    expect(pollworkerAuth.card.clearStoredData).toHaveBeenCalledTimes(1);
  });

  // print an additional report
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Report' })
  );
  await waitFor(() => {
    expect(printFn).toHaveBeenCalledTimes(2);
  });
  screen.getByText('Printing polls closed report');
  await screen.findByText('Polls Closed Report Printed');

  // close out flow
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => {
    expect(screen.queryAllByRole('alertdialog').length).toBe(0);
  });
});

test('can toggle between vote activation and "other actions" during polls open', async () => {
  renderScreen({
    isPollsOpen: true,
    machineConfig: fakeMachineConfig({ appMode: MarkAndPrint }),
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Select Ballot Style'));

  // switch to other actions pane
  userEvent.click(screen.getByText('View Other Actions'));
  screen.getByText('System Diagnostics');

  // switch back
  userEvent.click(screen.getByText('Back to Ballot Style Selection'));
  screen.getByText('Select Ballot Style');
});
