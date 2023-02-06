import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  electionMinimalExhaustiveSample,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleWithReportingUrl,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
  electionPrimaryNonpartisanContestsFixtures,
  electionSample2,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  fakeKiosk,
  advanceTimersAndPromises,
  makePollWorkerCard,
  generateCvr,
  getZeroCompressedTally,
  fakeUsbDrive,
  expectPrint,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  BallotCountDetails,
  singlePrecinctSelectionFor,
  ReportSourceMachineType,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
} from '@votingworks/utils';
import {
  CastVoteRecord,
  CompressedTally,
  ContestId,
  Dictionary,
  ElectionDefinition,
  PrecinctSelection,
  VotingMethod,
} from '@votingworks/types';

import userEvent from '@testing-library/user-event';
import MockDate from 'mockdate';
import { fakeLogger } from '@votingworks/logging';
import { err } from '@votingworks/basics';
import { fakeFileWriter } from '../test/helpers/fake_file_writer';
import { App } from './app';
import { createApiMock, statusNoPaper } from '../test/helpers/mock_api_client';

const apiMock = createApiMock();

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

function renderApp({ connectPrinter }: { connectPrinter: boolean }) {
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectPrinter,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  const storage = new MemoryStorage();
  render(
    <App
      card={card}
      hardware={hardware}
      logger={logger}
      apiClient={apiMock.mockApiClient}
    />
  );
  return { card, hardware, logger, storage };
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock.mockApiClient.reset();
  apiMock.expectGetMachineConfig();

  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  kiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  window.kiosk = kiosk;
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

async function closePolls({
  electionDefinition,
  castVoteRecords,
  precinctSelection,
  card,
  removeCardAfter = true,
}: {
  electionDefinition: ElectionDefinition;
  castVoteRecords: CastVoteRecord[];
  precinctSelection: PrecinctSelection;
  card: MemoryCard;
  removeCardAfter?: boolean;
}): Promise<void> {
  apiMock.expectGetCastVoteRecordsForTally(castVoteRecords);
  apiMock.expectExportCastVoteRecordsToUsbDrive();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_closed_final',
  });
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Polls are closed.');
  if (removeCardAfter) {
    card.removeCard();
    await screen.findByText('Voting is complete.');
  }
}

test('printing: polls open, All Precincts, primary election + check additional report', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition });
  apiMock.expectGetScannerStatus(statusNoPaper, 4);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Polls Closed');

  // Open the polls
  apiMock.expectGetCastVoteRecordsForTally([]);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  async function checkReport() {
    await expectPrint((printedElement) => {
      expect(
        printedElement.queryAllByText('TEST Polls Opened Report for Precinct 1')
      ).toHaveLength(election.parties.length);
      expect(
        printedElement.queryAllByText('TEST Polls Opened Report for Precinct 2')
      ).toHaveLength(election.parties.length);

      expect(
        printedElement.queryAllByText('Mammal Party Example Primary Election:')
      ).toHaveLength(election.precincts.length);
      expect(
        printedElement.queryAllByText('Fish Party Example Primary Election:')
      ).toHaveLength(election.precincts.length);

      // Check that there are no QR code pages since we are opening polls, even though reporting is turned on.
      expect(
        printedElement.queryAllByText('Automatic Election Results Reporting')
      ).toHaveLength(0);
    });
  }
  await checkReport();

  userEvent.click(screen.getByText('Print Additional Polls Opened Report'));
  await screen.findByText('Printing Report…');
  await advanceTimersAndPromises(4);
  await screen.findByText('Polls are open.');
  await checkReport();
});

test('saving to card: polls open, All Precincts, primary election + test failed card write', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  apiMock.expectGetConfig({ electionDefinition });
  apiMock.expectGetScannerStatus(statusNoPaper, 4);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Polls Closed');

  // Open the polls
  apiMock.expectGetCastVoteRecordsForTally([]);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  // Mimic what would happen if the tallies by precinct didn't fit on the card but the overall tally does.
  // Mock the card reader not to return back whatever we save
  jest
    .spyOn(card, 'readLongObject')
    .mockResolvedValue(err(new Error('bad read')));
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  card.removeCard();
  await advanceTimersAndPromises(1);

  const expectedCombinedTally: CompressedTally = [
    [0, 0, 0, 0, 0, 0, 0], // best animal mammal
    [0, 0, 0, 0, 0, 0], // best animal fish
    [0, 0, 0, 0, 0, 0, 0, 0], // zoo council
    [0, 0, 0, 0, 0, 0, 0, 0], // aquarium council
    [0, 0, 0, 0, 0], // new zoo either neither
    [0, 0, 0, 0, 0], // new zoo pick one
    [0, 0, 0, 0, 0], // fishing ban yes no
  ];
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      [0, 0, 0, 0, 0, 0, 0], // best animal mammal
      [0, 0, 0, 0, 0, 0], // best animal fish
      [0, 0, 0, 0, 0, 0, 0, 0], // zoo council
      [0, 0, 0, 0, 0, 0, 0, 0], // aquarium council
      [0, 0, 0, 0, 0], // new zoo either neither
      [0, 0, 0, 0, 0], // new zoo pick one
      [0, 0, 0, 0, 0], // fishing ban yes no
    ],
    'precinct-2': [
      [0, 0, 0, 0, 0, 0, 0], // best animal mammal
      [0, 0, 0, 0, 0, 0], // best animal fish
      [0, 0, 0, 0, 0, 0, 0, 0], // zoo council
      [0, 0, 0, 0, 0, 0, 0, 0], // aquarium council
      [0, 0, 0, 0, 0], // new zoo either neither
      [0, 0, 0, 0, 0], // new zoo pick one
      [0, 0, 0, 0, 0], // fishing ban yes no
    ],
  };
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    '0,__ALL_PRECINCTS': [0, 0],
    '0,precinct-1': [0, 0],
    '0,precinct-2': [0, 0],
    '1,__ALL_PRECINCTS': [0, 0],
    '1,precinct-1': [0, 0],
    '1,precinct-2': [0, 0],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(2);
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 0,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'open_polls',
    })
  );
  // Expect the final call to have an empty tallies by precinct dictionary
  expect(writeLongObjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 0,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: undefined,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'open_polls',
    })
  );
});

const PRIMARY_ALL_PRECINCTS_CVRS = [
  generateCvr(
    electionMinimalExhaustiveSampleWithReportingUrl,
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
    electionMinimalExhaustiveSampleWithReportingUrl,
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
    electionMinimalExhaustiveSampleWithReportingUrl,
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
];

test('printing: polls closed, primary election, all precincts + quickresults on', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    card,
  });

  await expectPrint((printedElement) => {
    expect(
      printedElement.queryAllByText('TEST Polls Closed Report for Precinct 1')
    ).toHaveLength(election.parties.length);
    expect(
      printedElement.queryAllByText('TEST Polls Closed Report for Precinct 2')
    ).toHaveLength(election.parties.length);

    expect(
      printedElement.queryAllByText('Mammal Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);
    expect(
      printedElement.queryAllByText('Fish Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);

    // Check that there is a QR code page since we are closing polls
    printedElement.getByText('Automatic Election Results Reporting');

    // Check that the expected results are on the tally report for Precinct 1 Mammal Party
    const precinct1MammalReport = printedElement.getByTestId(
      'tally-report-0-precinct-1'
    );
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
    expectContestResultsInReport(
      precinct1MammalReport,
      'new-zoo-pick',
      1,
      1,
      0,
      {
        yes: 0,
        no: 0,
      }
    );
    // Check that the expected results are on the tally report for Precinct 1 Fish Party
    const precinct1FishReport = printedElement.getByTestId(
      'tally-report-1-precinct-1'
    );
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
    const precinct2MammalReport = printedElement.getByTestId(
      'tally-report-0-precinct-2'
    );
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
    expectContestResultsInReport(
      precinct2MammalReport,
      'new-zoo-pick',
      1,
      0,
      0,
      {
        yes: 0,
        no: 1,
      }
    );
    // Check that the expected results are on the tally report for Precinct 2 Fish Party
    const precinct2FishReport = printedElement.getByTestId(
      'tally-report-1-precinct-2'
    );
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
  });
});

test('saving to card: polls closed, primary election, all precincts', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    card,
  });

  const expectedCombinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [0, 0, 2, 2, 0], // new zoo either neither
    [1, 0, 2, 0, 1], // new zoo pick one
    [0, 0, 1, 0, 1], // fishing ban yes no
  ];
  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      [0, 0, 1, 0, 1, 0, 0], // best animal mammal
      [0, 0, 0, 0, 0, 0], // best animal fish
      [1, 0, 1, 1, 0, 0, 0, 1], // zoo council
      [0, 0, 0, 0, 0, 0, 0, 0], // aquarium council
      [0, 0, 1, 1, 0], // new zoo either neither
      [1, 0, 1, 0, 0], // new zoo pick one
      [0, 0, 0, 0, 0], // fishing ban yes no
    ],
    'precinct-2': [
      [0, 1, 1, 0, 0, 0, 0], // best animal mammal
      [0, 0, 1, 1, 0, 0], // best animal fish
      [2, 0, 1, 0, 0, 0, 1, 0], // zoo council
      [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
      [0, 0, 1, 1, 0], // new zoo either neither
      [0, 0, 1, 0, 1], // new zoo pick one
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
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});

const PRIMARY_SINGLE_PRECINCT_CVRS = [
  generateCvr(
    electionMinimalExhaustiveSample,
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
    electionMinimalExhaustiveSample,
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
    electionMinimalExhaustiveSample,
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
];

test('printing: polls closed, primary election, single precinct + check additional report', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { election } = electionDefinition;
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_SINGLE_PRECINCT_CVRS,
    precinctSelection,
    card,
    removeCardAfter: false,
  });

  async function checkReport() {
    await expectPrint((printedElement) => {
      expect(
        printedElement.queryAllByText('TEST Polls Closed Report for Precinct 1')
      ).toHaveLength(election.parties.length);
      expect(
        printedElement.queryAllByText('TEST Polls Closed Report for Precinct 2')
      ).toHaveLength(0);

      printedElement.getByText('Mammal Party Example Primary Election:');
      printedElement.getByText('Fish Party Example Primary Election:');

      // quickresults disabled by default
      expect(
        printedElement.queryAllByText('Automatic Election Results Reporting')
      ).toHaveLength(0);

      // Check that the expected results are on the tally report for Precinct 1 Mammal Party
      const precinct1MammalReport = printedElement.getByTestId(
        'tally-report-0-precinct-1'
      );
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
      expectContestResultsInReport(
        precinct1MammalReport,
        'new-zoo-pick',
        2,
        1,
        0,
        {
          yes: 0,
          no: 1,
        }
      );
      // Check that the expected results are on the tally report for Precinct 1 Fish Party
      const precinct1FishReport = printedElement.getByTestId(
        'tally-report-1-precinct-1'
      );
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
    });
  }
  await checkReport();

  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    ballotsCounted: 3,
  });
  userEvent.click(screen.getByText('Print Additional Polls Closed Report'));
  await screen.findByText('Printing Report…');
  await advanceTimersAndPromises(4);
  await screen.findByText('Polls are closed.');
  await checkReport();
});

test('saving to card: polls closed, primary election, single precinct', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_SINGLE_PRECINCT_CVRS,
    precinctSelection,
    card,
  });

  const expectedCombinedTally: CompressedTally = [
    [0, 1, 2, 0, 1, 0, 0], // best animal mammal
    [0, 0, 1, 1, 0, 0], // best animal fish
    [3, 0, 2, 1, 0, 0, 1, 1], // zoo council
    [0, 0, 1, 1, 0, 0, 1, 0], // aquarium council
    [0, 0, 2, 2, 0], // new zoo either neither
    [1, 0, 2, 0, 1], // new zoo pick one
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
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 3,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('precinct-1'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});

const GENERAL_ALL_PRECINCTS_CVRS = [
  generateCvr(
    electionSample2,
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
    electionSample2,
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
];

test('printing: polls closed, general election, all precincts', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    card,
  });

  await expectPrint((printedElement) => {
    printedElement.getByText('TEST Polls Closed Report for Center Springfield');
    printedElement.getByText('TEST Polls Closed Report for North Springfield');
    printedElement.getByText('TEST Polls Closed Report for South Springfield');

    // quickresults is turned off by default
    expect(
      printedElement.queryAllByText('Automatic Election Results Reporting')
    ).toHaveLength(0);

    // Check that the expected results are on the tally report for Center Springfield
    const centerSpringfieldReport = printedElement.getByTestId(
      'tally-report-undefined-23'
    );
    expectBallotCountsInReport(centerSpringfieldReport, 1, 0, 1);
    expectContestResultsInReport(
      centerSpringfieldReport,
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
        'write-in': 0,
      }
    );
    expectContestResultsInReport(centerSpringfieldReport, 'prop-1', 1, 0, 0, {
      yes: 1,
      no: 0,
    });

    // Check that the expected results are on the tally report for South Springfield
    const southSpringfieldReport = printedElement.getByTestId(
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
    const northSpringfieldReport = printedElement.getByTestId(
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
  });
});

test('saving to card: polls closed, general election, all precincts', async () => {
  const electionDefinition = electionSample2Definition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    card,
  });

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
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});

const GENERAL_SINGLE_PRECINCT_CVRS = [
  generateCvr(
    electionSample2,
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
    electionSample2,
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
];

test('printing: polls closed, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  const precinctSelection = singlePrecinctSelectionFor('23');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_SINGLE_PRECINCT_CVRS,
    precinctSelection,
    card,
  });

  await expectPrint((printedElement) => {
    printedElement.getByText('TEST Polls Closed Report for Center Springfield');
    expect(
      printedElement.queryAllByText(
        'TEST Polls Closed Report for North Springfield'
      )
    ).toHaveLength(0);
    expect(
      printedElement.queryAllByText(
        'TEST Polls Closed Report for South Springfield'
      )
    ).toHaveLength(0);

    // quickresults turned off by default
    expect(
      printedElement.queryAllByText('Automatic Election Results Reporting')
    ).toHaveLength(0);

    // Check that the expected results are on the tally report for Center Springfield
    const centerSpringfieldReport = printedElement.getByTestId(
      'tally-report-undefined-23'
    );
    expectBallotCountsInReport(centerSpringfieldReport, 1, 1, 2);
    expectContestResultsInReport(
      centerSpringfieldReport,
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
        'write-in': 0,
      }
    );
    expectContestResultsInReport(centerSpringfieldReport, 'prop-1', 2, 1, 0, {
      yes: 1,
      no: 0,
    });
  });
});

test('saving to card: polls closed, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  const { election } = electionDefinition;
  const precinctSelection = singlePrecinctSelectionFor('23');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_SINGLE_PRECINCT_CVRS,
    precinctSelection,
    card,
  });

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
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});

const PRIMARY_NONPARTISAN_CONTESTS_CVR = [
  generateCvr(
    electionPrimaryNonpartisanContestsFixtures.election,
    {
      'best-animal-mammal': ['horse'],
      kingdom: ['yes'],
    },
    {
      precinctId: 'precinct-1',
      ballotStyleId: '1M',
      ballotType: VotingMethod.Precinct,
    }
  ),
  generateCvr(
    electionPrimaryNonpartisanContestsFixtures.election,
    {
      'best-animal-fish': ['seahorse'],
      kingdom: ['no'],
    },
    {
      precinctId: 'precinct-2',
      ballotStyleId: '2F',
      ballotType: VotingMethod.Precinct,
    }
  ),
  generateCvr(
    electionPrimaryNonpartisanContestsFixtures.election,
    {
      'best-animal-mammal': ['horse'],
      kingdom: ['yes'],
    },
    {
      precinctId: 'precinct-2',
      ballotStyleId: '1M',
      ballotType: VotingMethod.Precinct,
    }
  ),
  generateCvr(
    electionPrimaryNonpartisanContestsFixtures.election,
    {
      'best-animal-fish': ['seahorse'],
      kingdom: ['no'],
    },
    {
      precinctId: 'precinct-1',
      ballotStyleId: '2F',
      ballotType: VotingMethod.Precinct,
    }
  ),
];

test('printing: polls closed, general election with non-partisan contests, all precincts', async () => {
  const { electionDefinition, election } =
    electionPrimaryNonpartisanContestsFixtures;
  const precinctSelection = ALL_PRECINCTS_SELECTION;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 4 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_NONPARTISAN_CONTESTS_CVR,
    precinctSelection,
    card,
  });

  await expectPrint((printedElement) => {
    expect(
      printedElement.getAllByText('TEST Polls Closed Report for Precinct 1')
    ).toHaveLength(election.parties.length + 1);
    expect(
      printedElement.getAllByText('TEST Polls Closed Report for Precinct 2')
    ).toHaveLength(election.parties.length + 1);

    expect(
      printedElement.getAllByText('Mammal Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);
    expect(
      printedElement.getAllByText('Fish Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);
    expect(
      printedElement.getAllByText(
        'Example Primary Election Nonpartisan Contests:'
      )
    ).toHaveLength(election.precincts.length);

    // Check for expected results on nonpartisan page for precinct 1
    const nonpartisanPrecinct1Report = printedElement.getByTestId(
      'tally-report-undefined-precinct-1'
    );
    expectBallotCountsInReport(nonpartisanPrecinct1Report, 2, 0, 2);
    expectContestResultsInReport(
      nonpartisanPrecinct1Report,
      'kingdom',
      2,
      0,
      0,
      {
        yes: 1,
        no: 1,
      }
    );

    // Check that partisan races do not appear on nonpartisan page
    const partisanContestIds = election.contests
      .filter((c) => c.partyId)
      .map((c) => c.id);
    for (const contestId of partisanContestIds) {
      expect(
        within(nonpartisanPrecinct1Report).queryByTestId(
          `results-table-${contestId}`
        )
      ).toBeFalsy();
    }

    // Check that nonpartisan races do not appear on partisan pages
    const nonpartisanContestId = election.contests.find((c) => !c.partyId)!.id;
    expect(
      within(
        printedElement.getByTestId('tally-report-0-precinct-1')
      ).queryByTestId(`results-table-${nonpartisanContestId}`)
    ).toBeFalsy();
    expect(
      within(
        printedElement.getByTestId('tally-report-1-precinct-1')
      ).queryByTestId(`results-table-${nonpartisanContestId}`)
    ).toBeFalsy();
  });
});

test('saving to card: polls closed, general election with non-partisan contests, all precincts', async () => {
  const { electionDefinition } = electionPrimaryNonpartisanContestsFixtures;
  const precinctSelection = ALL_PRECINCTS_SELECTION;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 4 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_NONPARTISAN_CONTESTS_CVR,
    precinctSelection,
    card,
  });

  const expectedCombinedTally = [
    [0, 0, 2, 2, 0, 0, 0], // best animal mammal
    [0, 0, 2, 2, 0, 0], // best animal fish
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    [0, 0, 4, 2, 2], // kingdom preference
  ];

  const expectedTalliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      [0, 0, 1, 1, 0, 0, 0], // best animal mammal
      [0, 0, 1, 1, 0, 0], // best animal fish
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      [0, 0, 2, 1, 1], // kingdom preference
    ],
    'precinct-2': [
      [0, 0, 1, 1, 0, 0, 0], // best animal mammal
      [0, 0, 1, 1, 0, 0], // best animal fish
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      [0, 0, 2, 1, 1], // kingdom preference
    ],
  };
  const expectedBallotCounts: Dictionary<BallotCountDetails> = {
    '0,precinct-1': [1, 0],
    '0,precinct-2': [1, 0],
    '1,precinct-1': [1, 0],
    '1,precinct-2': [1, 0],
    'undefined,precinct-1': [2, 0],
    'undefined,precinct-2': [2, 0],
    '0,__ALL_PRECINCTS': [2, 0],
    '1,__ALL_PRECINCTS': [2, 0],
  };
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 4,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection,
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});

test('printing: polls paused', async () => {
  MockDate.set('2022-10-31T16:23:00.000Z');
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 2);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Insert Your Ballot Below');

  // Pause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('No'));
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Voting paused.');

  await expectPrint((printedElement) => {
    // Check heading
    printedElement.getByText(
      'TEST Voting Paused Report for Center Springfield'
    );
    printedElement.getByText('Voting Paused:');
    // Check contents
    printedElement.getByText(hasTextAcrossElements('Ballots Scanned Count2'));
    printedElement.getByText(hasTextAcrossElements('Polls StatusPaused'));
    printedElement.getByText(
      hasTextAcrossElements('Time Voting PausedMon, Oct 31, 2022, 4:23 PM')
    );
  });
});

test('saving to card: polls paused', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 4);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Insert Your Ballot Below');

  // Pause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(screen.getByText('No'));
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Voting paused.');
  card.removeCard();
  await advanceTimersAndPromises(1);

  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      pollsTransition: 'pause_voting',
    })
  );
});

test('printing: polls unpaused', async () => {
  MockDate.set('2022-10-31T16:23:00.000Z');
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 2);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Polls Paused');

  // Unpause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(await screen.findByText('Yes, Resume Voting'));
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  await screen.findByText('Voting resumed.');

  await expectPrint((printedElement) => {
    // Check heading
    printedElement.getByText(
      'TEST Voting Resumed Report for Center Springfield'
    );
    printedElement.getByText('Voting Resumed:');
    // Check contents
    printedElement.getByText(hasTextAcrossElements('Ballots Scanned Count2'));
    printedElement.getByText(hasTextAcrossElements('Polls StatusOpen'));
    printedElement.getByText(
      hasTextAcrossElements('Time Voting ResumedMon, Oct 31, 2022, 4:23 PM')
    );
  });
});

test('saving to card: polls unpaused', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');

  // Unpause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(screen.getByText('Yes, Resume Voting'));
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  await screen.findByText('Voting resumed.');
  card.removeCard();
  await advanceTimersAndPromises(1);

  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      pollsTransition: 'resume_voting',
    })
  );
});

test('printing: polls closed from paused, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 3);
  const { card } = renderApp({ connectPrinter: true });
  await screen.findByText('Polls Paused');

  // Close the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.expectExportCastVoteRecordsToUsbDrive();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(screen.getByText('No'));
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_closed_final',
  });
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Polls are closed.');

  await expectPrint((printedElement) => {
    printedElement.getByText('TEST Polls Closed Report for Center Springfield');
    expect(
      printedElement.queryAllByText(
        'TEST Polls Closed Report for North Springfield'
      )
    ).toHaveLength(0);
    expect(
      printedElement.queryAllByText(
        'TEST Polls Closed Report for South Springfield'
      )
    ).toHaveLength(0);

    // quickresults turned off by default
    expect(
      printedElement.queryAllByText('Automatic Election Results Reporting')
    ).toHaveLength(0);

    // Check that the expected results are on the tally report for Center Springfield
    const centerSpringfieldReport = printedElement.getByTestId(
      'tally-report-undefined-23'
    );
    expectBallotCountsInReport(centerSpringfieldReport, 1, 1, 2);
    expectContestResultsInReport(
      centerSpringfieldReport,
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
        'write-in': 0,
      }
    );
    expectContestResultsInReport(centerSpringfieldReport, 'prop-1', 2, 1, 0, {
      yes: 1,
      no: 0,
    });
  });
});

test('saving to card: polls closed from paused, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 }, 4);
  const { card } = renderApp({ connectPrinter: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  await screen.findByText('Polls Paused');

  // Close the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.expectExportCastVoteRecordsToUsbDrive();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(screen.getByText('No'));
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_closed_final',
  });
  userEvent.click(await screen.findByText('Close Polls'));
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
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 2,
      machineId: '0002',
      timePollsTransitioned: expect.anything(),
      timeSaved: expect.anything(),
      precinctSelection: singlePrecinctSelectionFor('23'),
      tally: expectedCombinedTally,
      talliesByPrecinct: expectedTalliesByPrecinct,
      ballotCounts: expectedBallotCounts,
      pollsTransition: 'close_polls',
    })
  );
});
