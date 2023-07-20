import {
  electionMinimalExhaustiveSample,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleWithReportingUrl,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
  electionSample2,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  generateCvr,
  expectPrint,
  hasTextAcrossElements,
  fakeKiosk,
} from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
  MemoryHardware,
} from '@votingworks/utils';
import {
  CastVoteRecord,
  ContestId,
  Dictionary,
  ElectionDefinition,
  PrecinctReportDestination,
  PrecinctSelection,
  VotingMethod,
} from '@votingworks/types';

import userEvent from '@testing-library/user-event';
import MockDate from 'mockdate';
import { fakeLogger } from '@votingworks/logging';
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';
import { App } from './app';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

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

function renderApp({
  connectPrinter,
  precinctReportDestination,
}: {
  connectPrinter: boolean;
  precinctReportDestination?: PrecinctReportDestination;
}) {
  const hardware = MemoryHardware.build({
    connectPrinter,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  render(
    <App
      hardware={hardware}
      logger={logger}
      apiClient={apiMock.mockApiClient}
      precinctReportDestination={precinctReportDestination}
    />
  );
  return { hardware, logger };
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.removeCard(); // Set a default auth state of no card inserted.

  const kiosk = fakeKiosk();
  window.kiosk = kiosk;
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

async function closePolls({
  electionDefinition,
  castVoteRecords,
  precinctSelection,
  removeCardAfter = true,
}: {
  electionDefinition: ElectionDefinition;
  castVoteRecords: CastVoteRecord[];
  precinctSelection: PrecinctSelection;
  removeCardAfter?: boolean;
}): Promise<void> {
  apiMock.expectGetCastVoteRecordsForTally(castVoteRecords);
  apiMock.expectExportCastVoteRecordsToUsbDrive();
  apiMock.authenticateAsPollWorker(electionDefinition);
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
    apiMock.removeCard();
    await screen.findByText('Voting is complete.');
  }
}

test('polls open, All Precincts, primary election + check additional report', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition });
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Closed');

  // Open the polls
  apiMock.expectGetCastVoteRecordsForTally([]);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  async function checkReport() {
    await expectPrint((printedElement) => {
      expect(
        printedElement.queryAllByText('TEST Polls Opened Report for Precinct 1')
      ).toHaveLength(election.parties.length + 1);
      expect(
        printedElement.queryAllByText('TEST Polls Opened Report for Precinct 2')
      ).toHaveLength(election.parties.length + 1);

      expect(
        printedElement.queryAllByText('Mammal Party Example Primary Election:')
      ).toHaveLength(election.precincts.length);
      expect(
        printedElement.queryAllByText('Fish Party Example Primary Election:')
      ).toHaveLength(election.precincts.length);
      expect(
        printedElement.queryAllByText(
          'Example Primary Election Nonpartisan Contests:'
        )
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

test('polls closed, primary election, all precincts + quickresults on', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  await expectPrint((printedElement) => {
    expect(
      printedElement.queryAllByText('TEST Polls Closed Report for Precinct 1')
    ).toHaveLength(election.parties.length + 1);
    expect(
      printedElement.queryAllByText('TEST Polls Closed Report for Precinct 2')
    ).toHaveLength(election.parties.length + 1);

    expect(
      printedElement.queryAllByText('Mammal Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);
    expect(
      printedElement.queryAllByText('Fish Party Example Primary Election:')
    ).toHaveLength(election.precincts.length);
    expect(
      printedElement.queryAllByText(
        'Example Primary Election Nonpartisan Contests:'
      )
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

    // Check that the expected results are on the tally report for Precinct 1 Nonpartisan Contests
    const precinct1NonpartisanReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-1'
    );
    expectBallotCountsInReport(precinct1NonpartisanReport, 1, 0, 1);
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'new-zoo-either',
      1,
      0,
      0,
      { yes: 1, no: 0 }
    );
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'new-zoo-pick',
      1,
      1,
      0,
      {
        yes: 0,
        no: 0,
      }
    );
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'fishing',
      1,
      1,
      0,
      {
        yes: 0,
        no: 0,
      }
    );

    // Check that the expected results are on the tally report for Precinct 2 Nonpartisan Contests
    const precinct2NonpartisanReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-2'
    );
    expectBallotCountsInReport(precinct2NonpartisanReport, 1, 1, 2);
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'new-zoo-either',
      2,
      1,
      0,
      { yes: 1, no: 0 }
    );
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'new-zoo-pick',
      2,
      1,
      0,
      {
        yes: 0,
        no: 1,
      }
    );
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'fishing',
      2,
      1,
      0,
      {
        yes: 0,
        no: 1,
      }
    );

    // Check that the non-partisan pages contain no partisan races
    const partisanContestIds = election.contests
      .filter((c) => c.type === 'candidate' && c.partyId)
      .map((c) => c.id);
    for (const contestId of partisanContestIds) {
      expect(
        within(precinct1NonpartisanReport).queryByTestId(
          `results-table-${contestId}`
        )
      ).toBeFalsy();
      expect(
        within(precinct2NonpartisanReport).queryByTestId(
          `results-table-${contestId}`
        )
      ).toBeFalsy();
    }

    // Check that partisan pages do not contain no nonpartisan races
    const nonpartisanContestIds = election.contests.find(
      (c) => c.type !== 'candidate' || !c.partyId
    )!.id;
    for (const contestId of nonpartisanContestIds) {
      expect(
        within(precinct1MammalReport).queryByTestId(
          `results-table-${contestId}`
        )
      ).toBeFalsy();
      expect(
        within(precinct2MammalReport).queryByTestId(
          `results-table-${contestId}`
        )
      ).toBeFalsy();
      expect(
        within(precinct1FishReport).queryByTestId(`results-table-${contestId}`)
      ).toBeFalsy();
      expect(
        within(precinct2FishReport).queryByTestId(`results-table-${contestId}`)
      ).toBeFalsy();
    }
  });
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

test('polls closed, primary election, single precinct + check additional report', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { election } = electionDefinition;
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: PRIMARY_SINGLE_PRECINCT_CVRS,
    precinctSelection,
    removeCardAfter: false,
  });

  async function checkReport() {
    await expectPrint((printedElement) => {
      expect(
        printedElement.queryAllByText('TEST Polls Closed Report for Precinct 1')
      ).toHaveLength(election.parties.length + 1);
      expect(
        printedElement.queryAllByText('TEST Polls Closed Report for Precinct 2')
      ).toHaveLength(0);

      printedElement.getByText('Mammal Party Example Primary Election:');
      printedElement.getByText('Fish Party Example Primary Election:');
      printedElement.getByText(
        'Example Primary Election Nonpartisan Contests:'
      );

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

      const precinct1NonpartisanReport = printedElement.getByTestId(
        'tally-report-undefined-precinct-1'
      );
      expectContestResultsInReport(
        precinct1NonpartisanReport,
        'new-zoo-either',
        3,
        1,
        0,
        { yes: 2, no: 0 }
      );
      expectContestResultsInReport(
        precinct1NonpartisanReport,
        'new-zoo-pick',
        3,
        2,
        0,
        {
          yes: 0,
          no: 1,
        }
      );
      expectContestResultsInReport(
        precinct1NonpartisanReport,
        'fishing',
        3,
        2,
        0,
        {
          yes: 0,
          no: 1,
        }
      );
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

test('polls closed, general election, all precincts', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({ electionDefinition, pollsState: 'polls_open' });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_ALL_PRECINCTS_CVRS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
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

test('polls closed, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  const precinctSelection = singlePrecinctSelectionFor('23');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    castVoteRecords: GENERAL_SINGLE_PRECINCT_CVRS,
    precinctSelection,
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

test('polls paused', async () => {
  MockDate.set('2022-10-31T16:23:00.000Z');
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Pause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.authenticateAsPollWorker(electionDefinition);
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

test('polls unpaused', async () => {
  MockDate.set('2022-10-31T16:23:00.000Z');
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Paused');

  // Unpause the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.authenticateAsPollWorker(electionDefinition);
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

test('polls closed from paused, general election, single precinct', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_paused',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Paused');

  // Close the polls
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.expectExportCastVoteRecordsToUsbDrive();
  apiMock.authenticateAsPollWorker(electionDefinition);
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

test('must have printer attached to open polls (thermal printer)', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_closed_initial',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  const { hardware } = renderApp({
    connectPrinter: false,
    precinctReportDestination: 'thermal-sheet-printer',
  });
  await screen.findByText('Polls Closed');

  // Opening the polls should require a printer
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  const openButton = screen.getButton('Yes, Open the Polls');
  expect(openButton).toBeDisabled();
  screen.getByText('Attach printer to continue.');

  act(() => {
    hardware.setPrinterConnected(true);
  });

  await waitFor(() => expect(openButton).toBeEnabled());
  expect(
    screen.queryByText('Attach printer to continue.')
  ).not.toBeInTheDocument();
});

test('must have printer attached to close polls (thermal printer)', async () => {
  const electionDefinition = electionSample2Definition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
    pollsState: 'polls_open',
  });
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  const { hardware } = renderApp({
    connectPrinter: false,
    precinctReportDestination: 'thermal-sheet-printer',
  });
  await screen.findByText(/Insert Your Ballot/);

  // Opening the polls should require a printer
  apiMock.expectGetCastVoteRecordsForTally(GENERAL_SINGLE_PRECINCT_CVRS);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  const openButton = screen.getButton('Yes, Close the Polls');
  expect(openButton).toBeDisabled();
  screen.getByText('Attach printer to continue.');

  act(() => {
    hardware.setPrinterConnected(true);
  });

  await waitFor(() => expect(openButton).toBeEnabled());
  expect(
    screen.queryByText('Attach printer to continue.')
  ).not.toBeInTheDocument();
});
