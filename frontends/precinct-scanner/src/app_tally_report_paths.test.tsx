import React from 'react';
import fetchMock from 'fetch-mock';
import { render, fireEvent, screen, act, within } from '@testing-library/react';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  fakeKiosk,
  advanceTimersAndPromises,
  makePollWorkerCard,
  generateFileContentFromCvrs,
  generateCvr,
  getZeroCompressedTally,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { Scan } from '@votingworks/api';
import {
  ALL_PRECINCTS_SELECTION,
  BallotCountDetails,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  singlePrecinctSelectionFor,
  TallySourceMachineType,
  typedAs,
} from '@votingworks/utils';
import {
  CompressedTally,
  ContestId,
  Dictionary,
  err,
  VotingMethod,
} from '@votingworks/types';
import { App } from './app';
import { stateStorageKey } from './app_root';
import { MachineConfigResponse } from './config/types';

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.reset();
});

const getMachineConfigBody: MachineConfigResponse = {
  machineId: '0002',
  codeVersion: '3.14',
};

const getTestModeConfigTrueResponseBody: Scan.GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
};

const getPrecinctConfigAllPrecinctsResponseBody: Scan.GetPrecinctSelectionConfigResponse =
  {
    status: 'ok',
    precinctSelection: ALL_PRECINCTS_SELECTION,
  };

const getPrecinctConfigPrecinct1ResponseBody: Scan.GetPrecinctSelectionConfigResponse =
  {
    status: 'ok',
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  };

const getPrecinctConfigPrecinct23ResponseBody: Scan.GetPrecinctSelectionConfigResponse =
  {
    status: 'ok',
    precinctSelection: singlePrecinctSelectionFor('23'),
  };

const getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
  {
    status: 'ok',
  };

const getMarkThresholdOverridesConfigResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
  {
    status: 'ok',
    markThresholdOverrides: { definite: 0.5, marginal: 0.25 },
  };

const statusNoPaper: Scan.GetPrecinctScannerStatusResponse = {
  state: 'no_paper',
  canUnconfigure: false,
  ballotsCounted: 0,
};

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

test('expected tally reports are printed for a primary election with all precinct', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionMinimalExhaustiveSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Insert a pollworker card
  fetchMock.post('/precinct-scanner/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionMinimalExhaustiveSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);

  screen.getByText('All Precincts Unofficial TEST Polls Opened Report');
  expect(
    screen.queryAllByText('Precinct 1 Polls Opened Tally Report')
  ).toHaveLength(election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Opened Tally Report')
  ).toHaveLength(election.parties.length);

  expect(
    screen.queryAllByText('Mammal Party Example Primary Election')
  ).toHaveLength(election.precincts.length);
  expect(
    screen.queryAllByText('Fish Party Example Primary Election')
  ).toHaveLength(election.precincts.length);

  // Check there there are no QR code pages since we are opening polls, even though reporting is turned on.
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);
});

test('expected tally reports for a primary election with all precincts with CVRs, and quickresults turned on', async () => {
  const card = new MemoryCard();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionMinimalExhaustiveSampleWithReportingUrlDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      body: { ...statusNoPaper, ballotsCounted: 3 },
    })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/precinct-scanner/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter'],
          'zoo-council-mammal': ['zebra', 'write-in'],
          'new-zoo-either': ['yes'],
          'new-zoo-pick': [],
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '1M',
          ballotType: VotingMethod.Precinct,
        }
      ),
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter', 'horse'],
          'zoo-council-mammal': ['elephant'],
          'new-zoo-either': ['yes'],
          'new-zoo-pick': ['no'],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '1M',
          ballotType: VotingMethod.Absentee,
        }
      ),
      generateCvr(
        election,
        {
          'best-animal-fish': ['seahorse'],
          'aquarium-council-fish': ['manta-ray', 'triggerfish'],
          fishing: ['no'],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2F',
          ballotType: VotingMethod.Precinct,
        }
      ),
    ])
  );
  const pollWorkerCard = makePollWorkerCard(
    electionMinimalExhaustiveSampleWithReportingUrlDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);

  screen.getByText('All Precincts Unofficial TEST Polls Closed Report');
  expect(
    screen.queryAllByText('Precinct 1 Polls Closed Tally Report')
  ).toHaveLength(election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Closed Tally Report')
  ).toHaveLength(election.parties.length);

  expect(
    screen.queryAllByText('Mammal Party Example Primary Election')
  ).toHaveLength(election.precincts.length);
  expect(
    screen.queryAllByText('Fish Party Example Primary Election')
  ).toHaveLength(election.precincts.length);

  // Check there there is a QR code page since we are closing polls
  screen.getByText('Automatic Election Results Reporting');

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
    1,
    0,
    0,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'zoo-council-mammal',
    1,
    1,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 0, 'write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'new-zoo-either',
    1,
    0,
    0,
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(precinct1MammalReport, 'new-zoo-pick', 1, 1, 0, {
    yes: 0,
    no: 0,
  });
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
    0,
    0,
    0,
    { seahorse: 0, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReport,
    'aquarium-council-fish',
    0,
    0,
    0,
    {
      'manta-ray': 0,
      pufferfish: 0,
      triggerfish: 0,
      rockfish: 0,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(precinct1FishReport, 'fishing', 0, 0, 0, {
    yes: 0,
    no: 0,
  });
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
    1,
    0,
    1,
    { horse: 0, otter: 0, fox: 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReport,
    'zoo-council-mammal',
    1,
    2,
    0,
    { zebra: 0, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 0 }
  );
  expectContestResultsInReport(
    precinct2MammalReport,
    'new-zoo-either',
    1,
    0,
    0,
    { yes: 1, no: 0 }
  );
  expectContestResultsInReport(precinct2MammalReport, 'new-zoo-pick', 1, 0, 0, {
    yes: 0,
    no: 1,
  });
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
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct2FishReport,
    'aquarium-council-fish',
    1,
    0,
    0,
    {
      'manta-ray': 1,
      pufferfish: 0,
      triggerfish: 1,
      rockfish: 0,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(precinct2FishReport, 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });

  // Save the tally to card and get the expected tallies
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Polls are closed.');
  card.removeCard();
  await advanceTimersAndPromises(1);
  const expectedCombinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [2, 0, 0, 0, 0, 1, 1, 0, 2], // new zoo either neither
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
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
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    '0,__ALL_PRECINCTS': [1, 1],
    '0,precinct-1': [1, 0],
    '0,precinct-2': [0, 1],
    '1,__ALL_PRECINCTS': [1, 0],
    '1,precinct-1': [0, 0],
    '1,precinct-2': [1, 0],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: false,
    })
  );

  // Mimic what would happen if the tallies by precinct didn't fit on the card but the overall tally does.
  // Mock the card reader not to return back whatever we save
  jest
    .spyOn(card, 'readLongObject')
    .mockResolvedValue(err(new Error('bad read')));
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(3);
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
  // Expect the final call to have an empty tallies by precinct dictionary
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
});

test('expected tally reports for a primary election with a single precincts with CVRs', async () => {
  const card = new MemoryCard();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } = electionMinimalExhaustiveSampleDefinition;

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionMinimalExhaustiveSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigPrecinct1ResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      body: { ...statusNoPaper, ballotsCounted: 3 },
    })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/precinct-scanner/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter'],
          'zoo-council-mammal': ['zebra', 'write-in'],
          'new-zoo-either': ['yes'],
          'new-zoo-pick': [],
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '1M',
          ballotType: VotingMethod.Precinct,
        }
      ),
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter', 'horse'],
          'zoo-council-mammal': ['elephant'],
          'new-zoo-either': ['yes'],
          'new-zoo-pick': ['no'],
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '1M',
          ballotType: VotingMethod.Absentee,
        }
      ),
      generateCvr(
        election,
        {
          'best-animal-fish': ['seahorse'],
          'aquarium-council-fish': ['manta-ray', 'triggerfish'],
          fishing: ['no'],
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '2F',
          ballotType: VotingMethod.Precinct,
        }
      ),
    ])
  );
  const pollWorkerCard = makePollWorkerCard(
    electionMinimalExhaustiveSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);

  screen.getByText('Precinct 1 Unofficial TEST Polls Closed Report');
  expect(
    screen.queryAllByText('Precinct 1 Polls Closed Tally Report')
  ).toHaveLength(election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Closed Tally Report')
  ).toHaveLength(0);

  screen.getByText('Mammal Party Example Primary Election');
  screen.getByText('Fish Party Example Primary Election');

  // quickresults disabled by default
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const precinct1MammalReport = screen.getByTestId('tally-report-0-precinct-1');
  expectBallotCountsInReport(precinct1MammalReport, 1, 1, 2);
  expect(
    within(precinct1MammalReport).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1MammalReport,
    'best-animal-mammal',
    2,
    0,
    1,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'zoo-council-mammal',
    2,
    3,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, 'write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReport,
    'new-zoo-either',
    2,
    0,
    0,
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(precinct1MammalReport, 'new-zoo-pick', 2, 1, 0, {
    yes: 0,
    no: 1,
  });
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const precinct1FishReport = screen.getByTestId('tally-report-1-precinct-1');
  expectBallotCountsInReport(precinct1FishReport, 1, 0, 1);
  expect(
    within(precinct1FishReport).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1FishReport,
    'best-animal-fish',
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReport,
    'aquarium-council-fish',
    1,
    0,
    0,
    {
      'manta-ray': 1,
      pufferfish: 0,
      triggerfish: 1,
      rockfish: 0,
      'write-in': 0,
    }
  );
  expectContestResultsInReport(precinct1FishReport, 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });

  // Save the tally to card and get the expected tallies
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(screen.getAllByText('No')[0]);
  fireEvent.click(await screen.findByText('Close Polls for Precinct 1'));
  await screen.findByText('Polls are closed.');
  card.removeCard();
  await advanceTimersAndPromises(1);
  const expectedCombinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [2, 0, 0, 0, 0, 1, 1, 0, 2], // new zoo either neither
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': expectedCombinedTally,
  };
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    '0,__ALL_PRECINCTS': [1, 1],
    '0,precinct-1': [1, 1],
    '1,__ALL_PRECINCTS': [1, 0],
    '1,precinct-1': [1, 0],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('precinct-1'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: false,
    })
  );

  // Mimic what would happen if the tallies by precinct didn't fit on the card but the overall tally does.
  // Mock the card reader not to return back whatever we save
  jest
    .spyOn(card, 'readLongObject')
    .mockResolvedValue(err(new Error('bad read')));
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(screen.getAllByText('No')[0]);
  fireEvent.click(await screen.findByText('Open Polls for Precinct 1'));
  await screen.findByText('Polls are open.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(3);
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('precinct-1'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
  // Expect the final call to have an empty tallies by precinct dictionary
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('precinct-1'),
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
});

test('expected tally reports for a general election with all precincts with CVRs', async () => {
  const card = new MemoryCard();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } = electionSample2Definition;

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSample2Definition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      body: { ...statusNoPaper, ballotsCounted: 2 },
    })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/precinct-scanner/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          president: ['jackie-chan'],
          'prop-1': ['yes'],
        },
        {
          precinctId: '23',
          ballotStyleId: '12',
          ballotType: VotingMethod.Precinct,
        }
      ),
      generateCvr(
        election,
        {
          president: ['marie-curie'],
          'prop-1': [],
        },
        {
          precinctId: '21',
          ballotStyleId: '12',
          ballotType: VotingMethod.Absentee,
        }
      ),
    ])
  );
  const pollWorkerCard = makePollWorkerCard(
    electionSample2Definition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);

  screen.getByText('All Precincts Unofficial TEST Polls Closed Report');
  screen.getByText('Center Springfield Polls Closed Tally Report');
  screen.getByText('North Springfield Polls Closed Tally Report');
  screen.getByText('South Springfield Polls Closed Tally Report');

  // quickresults is turned off by default
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);

  // Check that the expected results are on the tally report for Center Springfield
  const centerSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-23'
  );
  expectBallotCountsInReport(centerSpringfieldReport, 1, 0, 1);
  expectContestResultsInReport(centerSpringfieldReport, 'president', 1, 0, 0, {
    'marie-curie': 0,
    'indiana-jones': 0,
    'mona-lisa': 0,
    'jackie-chan': 1,
    'tim-allen': 0,
    'write-in': 0,
  });
  expectContestResultsInReport(centerSpringfieldReport, 'prop-1', 1, 0, 0, {
    yes: 1,
    no: 0,
  });

  // Check that the expected results are on the tally report for South Springfield
  const southSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-20'
  );
  expectBallotCountsInReport(southSpringfieldReport, 0, 0, 0);
  expectContestResultsInReport(southSpringfieldReport, 'president', 0, 0, 0, {
    'marie-curie': 0,
    'indiana-jones': 0,
    'mona-lisa': 0,
    'jackie-chan': 0,
    'tim-allen': 0,
    'write-in': 0,
  });
  expectContestResultsInReport(southSpringfieldReport, 'prop-1', 0, 0, 0, {
    yes: 0,
    no: 0,
  });

  // Check that the expected results are on the tally report for North Springfield
  const northSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-21'
  );
  expectBallotCountsInReport(northSpringfieldReport, 0, 1, 1);
  expectContestResultsInReport(northSpringfieldReport, 'president', 1, 0, 0, {
    'marie-curie': 1,
    'indiana-jones': 0,
    'mona-lisa': 0,
    'jackie-chan': 0,
    'tim-allen': 0,
    'write-in': 0,
  });
  expectContestResultsInReport(northSpringfieldReport, 'prop-1', 1, 1, 0, {
    yes: 0,
    no: 0,
  });

  // Save the tally to card and get the expected tallies
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Polls are closed.');
  card.removeCard();
  await advanceTimersAndPromises(1);
  const expectedCombinedTally = election.contests.map(() => expect.anything());
  expectedCombinedTally[0] = [0, 0, 2, 1, 0, 0, 1, 0, 0]; // president
  const index102 = election.contests.findIndex((c) => c.id === 'prop-1');
  expectedCombinedTally[index102] = [1, 0, 2, 1, 0]; // measure 102
  const expectedTallyCenter = election.contests.map(() => expect.anything());
  expectedTallyCenter[0] = [0, 0, 1, 0, 0, 0, 1, 0, 0]; // president
  expectedTallyCenter[index102] = [0, 0, 1, 1, 0]; // measure 102
  const expectedTallyNorth = election.contests.map(() => expect.anything());
  expectedTallyNorth[0] = [0, 0, 1, 1, 0, 0, 0, 0, 0]; // president
  expectedTallyNorth[index102] = [1, 0, 1, 0, 0]; // measure 102
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    '23': expectedTallyCenter,
    '20': getZeroCompressedTally(election),
    '21': expectedTallyNorth,
  };
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    'undefined,__ALL_PRECINCTS': [1, 1],
    'undefined,23': [1, 0],
    'undefined,21': [0, 1],
    'undefined,20': [0, 0],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: false,
    })
  );
  // Mimic what would happen if the tallies by precinct didn't fit on the card but the overall tally does.
  // Mock the card reader not to return back whatever we save
  jest
    .spyOn(card, 'readLongObject')
    .mockResolvedValue(err(new Error('bad read')));
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(3);
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
  // Expect the final call to have an empty tallies by precinct dictionary
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
});

test('expected tally reports for a general election with a single precincts with CVRs', async () => {
  const card = new MemoryCard();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } = electionSample2Definition;

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSample2Definition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigPrecinct23ResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      body: { ...statusNoPaper, ballotsCounted: 2 },
    })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/precinct-scanner/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          president: ['jackie-chan'],
          'prop-1': ['yes'],
        },
        {
          precinctId: '23',
          ballotStyleId: '12',
          ballotType: VotingMethod.Precinct,
        }
      ),
      generateCvr(
        election,
        {
          president: ['marie-curie'],
          'prop-1': [],
        },
        {
          precinctId: '23',
          ballotStyleId: '12',
          ballotType: VotingMethod.Absentee,
        }
      ),
    ])
  );
  const pollWorkerCard = makePollWorkerCard(
    electionSample2Definition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);

  screen.getByText('Center Springfield Unofficial TEST Polls Closed Report');
  screen.getByText('Center Springfield Polls Closed Tally Report');
  expect(
    screen.queryAllByText('North Springfield Polls Closed Tally Report')
  ).toHaveLength(0);
  expect(
    screen.queryAllByText('South Springfield Polls Closed Tally Report')
  ).toHaveLength(0);

  // quickresults turned off by default
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);

  // Check that the expected results are on the tally report for Center Springfield
  const centerSpringfieldReport = screen.getByTestId(
    'tally-report-undefined-23'
  );
  expectBallotCountsInReport(centerSpringfieldReport, 1, 1, 2);
  expectContestResultsInReport(centerSpringfieldReport, 'president', 2, 0, 0, {
    'marie-curie': 1,
    'indiana-jones': 0,
    'mona-lisa': 0,
    'jackie-chan': 1,
    'tim-allen': 0,
    'write-in': 0,
  });
  expectContestResultsInReport(centerSpringfieldReport, 'prop-1', 2, 1, 0, {
    yes: 1,
    no: 0,
  });

  // Save the tally to card and get the expected tallies
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Polls are closed.');

  card.removeCard();
  await advanceTimersAndPromises(1);
  const expectedCombinedTally = election.contests.map(() => expect.anything());
  expectedCombinedTally[0] = [0, 0, 2, 1, 0, 0, 1, 0, 0]; // president
  const index102 = election.contests.findIndex((c) => c.id === 'prop-1');
  expectedCombinedTally[index102] = [1, 0, 2, 1, 0]; // measure 102
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    '23': expectedCombinedTally,
  };
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    'undefined,__ALL_PRECINCTS': [1, 1],
    'undefined,23': [1, 1],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: false,
    })
  );
  // Mimic what would happen if the tallies by precinct didn't fit on the card but the overall tally does.
  // Mock the card reader not to return back whatever we save
  jest
    .spyOn(card, 'readLongObject')
    .mockResolvedValue(err(new Error('bad read')));
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(3);
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
  // Expect the final call to have an empty tallies by precinct dictionary
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
});
