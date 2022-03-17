import React from 'react';
import fetchMock from 'fetch-mock';
import { render, fireEvent, screen, act, within } from '@testing-library/react';
import {
  electionMinimalExhaustiveSampleDefinition,
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
import {
  GetCurrentPrecinctConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  PatchTestModeConfigResponse,
  ScannerStatus,
} from '@votingworks/types/api/services/scan';
import {
  BallotCountDetails,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  TallySourceMachineType,
  typedAs,
} from '@votingworks/utils';
import {
  CompressedTally,
  ContestId,
  Dictionary,
  err,
  PrecinctSelectionKind,
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

const getTestModeConfigTrueResponseBody: GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
};

const getPrecinctConfigNoPrecinctResponseBody: GetCurrentPrecinctConfigResponse = {
  status: 'ok',
};

const getPrecinctConfigPrecinct1ResponseBody: GetCurrentPrecinctConfigResponse = {
  status: 'ok',
  precinctId: 'precinct-1',
};

const getPrecinctConfigPrecinct23ResponseBody: GetCurrentPrecinctConfigResponse = {
  status: 'ok',
  precinctId: '23',
};

const scanStatusWaitingForPaperResponseBody: GetScanStatusResponse = {
  scanner: ScannerStatus.WaitingForPaper,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
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
  const { election } = electionMinimalExhaustiveSampleDefinition;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', {
      body: electionMinimalExhaustiveSampleDefinition,
    })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
    .patchOnce('/config/testMode', {
      body: typedAs<PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Insert a pollworker card
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionMinimalExhaustiveSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  const NUMBER_REPORT_PURPOSES = 2;
  expect(
    screen.queryAllByText('All Precincts Unofficial TEST Polls Opened Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  // Check that there is a report for each precinct per report purpose per party
  expect(
    screen.queryAllByText('Precinct 1 Polls Opened Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Opened Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.parties.length);

  expect(
    screen.queryAllByText('Mammal Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.precincts.length);
  expect(
    screen.queryAllByText('Fish Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.precincts.length);

  // Check there there are no QR code pages since we are opening polls
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(0);
});

test('expected tally reports for a primary election with all precincts with CVRs', async () => {
  const card = new MemoryCard();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const scanStatus: GetScanStatusResponse = {
    scanner: ScannerStatus.WaitingForPaper,
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 3,
        startedAt: '2021-05-13T13:19:42.353Z',
        endedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', {
      body: electionMinimalExhaustiveSampleDefinition,
    })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatus })
    .patchOnce('/config/testMode', {
      body: typedAs<PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/scan/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter'],
          'zoo-council-mammal': ['zebra', '__write-in'],
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
    electionMinimalExhaustiveSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  const NUMBER_REPORT_PURPOSES = 2;
  expect(
    screen.queryAllByText('All Precincts Unofficial TEST Polls Closed Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  // Check that there is a report for each precinct per report purpose per party
  expect(
    screen.queryAllByText('Precinct 1 Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.parties.length);

  expect(
    screen.queryAllByText('Mammal Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.precincts.length);
  expect(
    screen.queryAllByText('Fish Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.precincts.length);

  // Check there there is 1 QR code page per report purpose since we are closing polls
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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

  const scanStatus: GetScanStatusResponse = {
    scanner: ScannerStatus.WaitingForPaper,
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 3,
        startedAt: '2021-05-13T13:19:42.353Z',
        endedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', {
      body: electionMinimalExhaustiveSampleDefinition,
    })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigPrecinct1ResponseBody })
    .get('/scan/status', { body: scanStatus })
    .patchOnce('/config/testMode', {
      body: typedAs<PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/scan/export',
    generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'best-animal-mammal': ['otter'],
          'zoo-council-mammal': ['zebra', '__write-in'],
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
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  const NUMBER_REPORT_PURPOSES = 2;
  expect(
    screen.queryAllByText('Precinct 1 Unofficial TEST Polls Closed Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  // Check that there is a report per report purpose per party
  expect(
    screen.queryAllByText('Precinct 1 Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES * election.parties.length);
  expect(
    screen.queryAllByText('Precinct 2 Polls Closed Tally Report')
  ).toHaveLength(0);

  expect(
    screen.queryAllByText('Mammal Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  expect(
    screen.queryAllByText('Fish Party Example Primary Election')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

  // Check there there is 1 QR code page per report purpose since we are closing polls
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

  // Check that the expected results are on the tally report for Precinct 1 Mammal Party
  const precinct1MammalReports = screen.getAllByTestId(
    'tally-report-0-precinct-1'
  );
  expect(precinct1MammalReports).toHaveLength(2);
  expectBallotCountsInReport(precinct1MammalReports[0], 1, 1, 2);
  expect(
    within(precinct1MammalReports[0]).queryAllByTestId(
      'results-table-best-animal-fish'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'best-animal-mammal',
    2,
    0,
    1,
    { horse: 0, otter: 1, fox: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'zoo-council-mammal',
    2,
    3,
    0,
    { zebra: 1, lion: 0, kangaroo: 0, elephant: 1, '__write-in': 1 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-either',
    2,
    0,
    0,
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    precinct1MammalReports[0],
    'new-zoo-pick',
    2,
    1,
    0,
    { yes: 0, no: 1 }
  );
  // Check that the expected results are on the tally report for Precinct 1 Fish Party
  const precinct1FishReports = screen.getAllByTestId(
    'tally-report-1-precinct-1'
  );
  expect(precinct1FishReports).toHaveLength(2);
  expectBallotCountsInReport(precinct1FishReports[0], 1, 0, 1);
  expect(
    within(precinct1FishReports[0]).queryAllByTestId(
      'results-table-best-animal-mammal'
    )
  ).toHaveLength(0);
  expectContestResultsInReport(
    precinct1FishReports[0],
    'best-animal-fish',
    1,
    0,
    0,
    { seahorse: 1, salmon: 0 }
  );
  expectContestResultsInReport(
    precinct1FishReports[0],
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
  expectContestResultsInReport(precinct1FishReports[0], 'fishing', 1, 0, 0, {
    yes: 0,
    no: 1,
  });

  // Save the tally to card and get the expected tallies
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(await screen.getAllByText('No')[0]);
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      },
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
  fireEvent.click(await screen.getAllByText('No')[0]);
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      },
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: 'precinct-1',
      },
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

  const scanStatus: GetScanStatusResponse = {
    scanner: ScannerStatus.WaitingForPaper,
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 2,
        startedAt: '2021-05-13T13:19:42.353Z',
        endedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSample2Definition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatus })
    .patchOnce('/config/testMode', {
      body: typedAs<PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/scan/export',
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
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  const NUMBER_REPORT_PURPOSES = 2;
  expect(
    screen.queryAllByText('All Precincts Unofficial TEST Polls Closed Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  // Check that there is a report for each precinct per report purpose
  expect(
    screen.queryAllByText('Center Springfield Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  expect(
    screen.queryAllByText('North Springfield Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  expect(
    screen.queryAllByText('South Springfield Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

  // Check there there is 1 QR code page per report purpose since we are closing polls
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

  // Check that the expected results are on the tally report for Center Springfield
  const centerSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-23'
  );
  expect(centerSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(centerSpringfieldReports[0], 1, 0, 1);
  expectContestResultsInReport(
    centerSpringfieldReports[0],
    'president',
    1,
    0,
    0,
    {
      'marie-curie': 0,
      'indiana-jones': 0,
      'mona-lisa': 0,
      'jackie-chan': 1,
      'tim-allen': 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(centerSpringfieldReports[0], 'prop-1', 1, 0, 0, {
    yes: 1,
    no: 0,
  });

  // Check that the expected results are on the tally report for South Springfield
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
      'marie-curie': 0,
      'indiana-jones': 0,
      'mona-lisa': 0,
      'jackie-chan': 0,
      'tim-allen': 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(southSpringfieldReports[0], 'prop-1', 0, 0, 0, {
    yes: 0,
    no: 0,
  });

  // Check that the expected results are on the tally report for North Springfield
  const northSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-21'
  );
  expect(northSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(northSpringfieldReports[0], 0, 1, 1);
  expectContestResultsInReport(
    northSpringfieldReports[0],
    'president',
    1,
    0,
    0,
    {
      'marie-curie': 1,
      'indiana-jones': 0,
      'mona-lisa': 0,
      'jackie-chan': 0,
      'tim-allen': 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(northSpringfieldReports[0], 'prop-1', 1, 1, 0, {
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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
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

  const scanStatus: GetScanStatusResponse = {
    scanner: ScannerStatus.WaitingForPaper,
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 2,
        startedAt: '2021-05-13T13:19:42.353Z',
        endedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSample2Definition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigPrecinct23ResponseBody })
    .get('/scan/status', { body: scanStatus })
    .patchOnce('/config/testMode', {
      body: typedAs<PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Insert a pollworker card
  fetchMock.post(
    '/scan/export',
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
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  const NUMBER_REPORT_PURPOSES = 2;
  expect(
    screen.queryAllByText(
      'Center Springfield Unofficial TEST Polls Closed Report'
    )
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  // Check that there is a report for each precinct per report purpose
  expect(
    screen.queryAllByText('Center Springfield Polls Closed Tally Report')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);
  expect(
    screen.queryAllByText('North Springfield Polls Closed Tally Report')
  ).toHaveLength(0);
  expect(
    screen.queryAllByText('South Springfield Polls Closed Tally Report')
  ).toHaveLength(0);

  // Check there there is 1 QR code page per report purpose since we are closing polls
  expect(
    screen.queryAllByText('Automatic Election Results Reporting')
  ).toHaveLength(1 * NUMBER_REPORT_PURPOSES);

  // Check that the expected results are on the tally report for Center Springfield
  const centerSpringfieldReports = screen.getAllByTestId(
    'tally-report-undefined-23'
  );
  expect(centerSpringfieldReports).toHaveLength(2);
  expectBallotCountsInReport(centerSpringfieldReports[0], 1, 1, 2);
  expectContestResultsInReport(
    centerSpringfieldReports[0],
    'president',
    2,
    0,
    0,
    {
      'marie-curie': 1,
      'indiana-jones': 0,
      'mona-lisa': 0,
      'jackie-chan': 1,
      'tim-allen': 0,
      '__write-in': 0,
    }
  );
  expectContestResultsInReport(centerSpringfieldReports[0], 'prop-1', 2, 1, 0, {
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      },
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      },
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
      precinctSelection: {
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      },
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      isPollsOpen: true,
    })
  );
});
