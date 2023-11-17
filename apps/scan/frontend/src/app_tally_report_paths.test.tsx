import {
  electionTwoPartyPrimary,
  electionTwoPartyPrimaryDefinition,
  electionGeneral,
  electionGeneralDefinition,
  asElectionDefinition,
} from '@votingworks/fixtures';
import {
  expectPrint,
  hasTextAcrossElements,
  fakeKiosk,
  PrintRenderResult,
} from '@votingworks/test-utils';
import {
  singlePrecinctSelectionFor,
  MemoryHardware,
  buildElectionResultsFixture,
} from '@votingworks/utils';
import {
  Election,
  ElectionDefinition,
  PrecinctReportDestination,
  Tabulation,
} from '@votingworks/types';

import userEvent from '@testing-library/user-event';
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
import { mockGetCurrentTime } from '../test/helpers/mock_polls_info';

let apiMock: ApiMock;

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

const GENERAL_ELECTION_RESULTS = [
  buildElectionResultsFixture({
    election: electionGeneral,
    cardCounts: {
      bmd: 0,
      hmpb: [100],
    },
    includeGenericWriteIn: true,
    contestResultsSummaries: {
      president: {
        type: 'candidate',
        ballots: 100,
        officialOptionTallies: {
          'barchi-hallaren': 70,
          'cramer-vuocolo': 30,
        },
      },
    },
  }),
];

const PRIMARY_ELECTION_RESULTS = [
  {
    partyId: '0',
    ...buildElectionResultsFixture({
      election: electionTwoPartyPrimary,
      cardCounts: {
        bmd: 0,
        hmpb: [80],
      },
      includeGenericWriteIn: true,
      contestResultsSummaries: {
        'best-animal-mammal': {
          type: 'candidate',
          ballots: 80,
          undervotes: 8,
          overvotes: 2,
          officialOptionTallies: {
            otter: 70,
          },
        },
        fishing: {
          type: 'yesno',
          ballots: 80,
          undervotes: 20,
          yesTally: 40,
          noTally: 20,
        },
      },
    }),
  },
  {
    partyId: '1',
    ...buildElectionResultsFixture({
      election: electionTwoPartyPrimary,
      cardCounts: {
        bmd: 0,
        hmpb: [70],
      },
      includeGenericWriteIn: true,
      contestResultsSummaries: {
        'best-animal-fish': {
          type: 'candidate',
          ballots: 70,
          officialOptionTallies: {
            seahorse: 70,
          },
        },
        fishing: {
          type: 'yesno',
          ballots: 70,
          undervotes: 10,
          yesTally: 30,
          noTally: 30,
        },
      },
    }),
  },
];

mockGetCurrentTime();

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
  latestScannerResultsByParty,
  removeCardAfter = true,
  ballotCount,
}: {
  electionDefinition: ElectionDefinition;
  latestScannerResultsByParty?: Tabulation.GroupList<Tabulation.ElectionResults>;
  removeCardAfter?: boolean;
  ballotCount?: number;
}): Promise<void> {
  if (latestScannerResultsByParty) {
    apiMock.expectGetScannerResultsByParty(latestScannerResultsByParty);
  }
  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'polls_closing' });
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  apiMock.expectTransitionPolls('close_polls');
  apiMock.expectGetPollsInfo(
    'polls_closed_final',
    ballotCount ? { ballotCount } : {}
  );
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Polls are closed.');
  if (removeCardAfter) {
    apiMock.removeCard();
    await screen.findByText('Voting is complete.');
  }
}

test('polls open, All Precincts, primary election + check additional report', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;
  apiMock.expectGetConfig({ electionDefinition });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Closed');

  // Open the polls
  apiMock.expectGetScannerResultsByParty([]);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectTransitionPolls('open_polls');
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  async function checkReport() {
    await expectPrint((printedElement) => {
      // correct number of sub-reports
      expect(
        printedElement.getAllByText(
          'Test Polls Opened Report for All Precincts'
        )
      ).toHaveLength(election.parties.length + 1);

      // check mammal zero report: title, total ballots, number of contests
      const mReport = printedElement.getByTestId('tally-report-0-undefined');
      within(mReport).getByText('Mammal Party Example Primary Election:');
      within(within(mReport).getByTestId('total-ballots')).getByText('0');
      expect(within(mReport).getAllByTestId(/results-table-/)).toHaveLength(2);

      // check fish zero report: title, total ballots, number of contests
      const fishReport = printedElement.getByTestId('tally-report-1-undefined');
      within(fishReport).getByText('Fish Party Example Primary Election:');
      within(within(fishReport).getByTestId('total-ballots')).getByText('0');
      expect(within(fishReport).getAllByTestId(/results-table-/)).toHaveLength(
        2
      );

      // check nonpartisan zero report: title, total ballots, number of contests
      const npReport = printedElement.getByTestId(
        'tally-report-undefined-undefined'
      );
      within(npReport).getByText(
        'Example Primary Election Nonpartisan Contests:'
      );
      within(within(npReport).getByTestId('total-ballots')).getByText('0');
      expect(within(npReport).getAllByTestId(/results-table-/)).toHaveLength(3);

      // Check that there are no QR code pages since we are opening polls, even though reporting is turned on.
      expect(
        printedElement.queryAllByText('Automatic Election Results Reporting')
      ).toHaveLength(0);
    });
  }
  await checkReport();

  userEvent.click(screen.getByText('Print Additional Polls Opened Report'));
  await screen.findByText('Printing Report…');
  await screen.findByText('Polls are open.');
  await checkReport();
});

test('polls closed, primary election, single precinct + quickresults on', async () => {
  const election: Election = {
    ...electionTwoPartyPrimary,
    quickResultsReportingUrl: 'https://results.voting.works',
  };
  const electionDefinition = asElectionDefinition(election);
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    latestScannerResultsByParty: PRIMARY_ELECTION_RESULTS,
  });

  await expectPrint((printedElement) => {
    // correct number of sub-reports
    expect(
      printedElement.getAllByText('Test Polls Closed Report for Precinct 1')
    ).toHaveLength(election.parties.length + 1);

    // check mammal zero report: title, total ballots, number of contests
    const mReport = printedElement.getByTestId('tally-report-0-precinct-1');
    within(mReport).getByText('Mammal Party Example Primary Election:');
    within(within(mReport).getByTestId('total-ballots')).getByText('80');
    expect(within(mReport).getAllByTestId(/results-table-/)).toHaveLength(2);
    within(within(mReport).getByTestId('best-animal-mammal-otter')).getByText(
      '70'
    );

    // check fish zero report: title, total ballots, number of contests
    const fReport = printedElement.getByTestId('tally-report-1-precinct-1');
    within(fReport).getByText('Fish Party Example Primary Election:');
    within(within(fReport).getByTestId('total-ballots')).getByText('70');
    expect(within(fReport).getAllByTestId(/results-table-/)).toHaveLength(2);
    within(within(fReport).getByTestId('best-animal-fish-seahorse')).getByText(
      '70'
    );

    // check nonpartisan zero report: title, total ballots, number of contests
    const npReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-1'
    );
    within(npReport).getByText(
      'Example Primary Election Nonpartisan Contests:'
    );
    within(within(npReport).getByTestId('total-ballots')).getByText('150');
    expect(within(npReport).getAllByTestId(/results-table-/)).toHaveLength(3);
    within(within(npReport).getByTestId('fishing-yes')).getByText('70');

    expect(
      printedElement.queryAllByText('Automatic Election Results Reporting')
    ).toHaveLength(1);
  });
});

test('polls open, general election, single precinct', async () => {
  const electionDefinition = electionGeneralDefinition;
  const precinctSelection = singlePrecinctSelectionFor('23');
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection,
  });
  apiMock.expectGetPollsInfo('polls_closed_initial');
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Closed');

  // Open the polls
  apiMock.expectGetScannerResultsByParty([]);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to open the polls?');
  apiMock.expectTransitionPolls('open_polls');
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  await expectPrint((printedElement) => {
    printedElement.getByText('Test Polls Opened Report for Center Springfield');
    printedElement.getByText('General Election:');
    within(printedElement.getByTestId('total-ballots')).getByText('0');
    expect(printedElement.getAllByTestId(/results-table-/)).toHaveLength(
      electionDefinition.election.contests.length
    );
  });
});

test('polls closed, general election, all precincts, reprint report', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Close the polls
  await closePolls({
    electionDefinition,
    latestScannerResultsByParty: GENERAL_ELECTION_RESULTS,
    ballotCount: 2,
  });

  function checkPrint(printedElement: PrintRenderResult): void {
    printedElement.getByText('Test Polls Closed Report for All Precincts');
    printedElement.getByText('General Election:');
    within(printedElement.getByTestId('total-ballots')).getByText('100');
    expect(printedElement.getAllByTestId(/results-table-/)).toHaveLength(
      electionDefinition.election.contests.length
    );
    within(printedElement.getByTestId('president-barchi-hallaren')).getByText(
      '70'
    );
  }

  await expectPrint(checkPrint);

  apiMock.authenticateAsPollWorker(electionDefinition);
  const reprintButton = await screen.findButton('Print Polls Closed Report');
  expect(reprintButton).toBeEnabled();
  userEvent.click(reprintButton);

  await expectPrint(checkPrint);
});

test('polls paused', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2022-10-31T16:23:00.000Z'));
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText(/Insert Your Ballot/i);

  // Pause the polls
  apiMock.expectGetScannerResultsByParty(GENERAL_ELECTION_RESULTS);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('No'));
  apiMock.expectTransitionPolls('pause_voting');
  apiMock.expectGetPollsInfo('polls_paused');
  userEvent.click(await screen.findByText('Pause Voting'));
  await screen.findByText('Voting paused.');

  await expectPrint((printedElement) => {
    // Check heading
    printedElement.getByText(
      'Test Voting Paused Report for Center Springfield'
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
  jest.useFakeTimers().setSystemTime(new Date('2022-10-31T16:23:00.000Z'));
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo('polls_paused');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Paused');

  // Unpause the polls
  apiMock.expectGetScannerResultsByParty(GENERAL_ELECTION_RESULTS);
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(await screen.findByText('Yes, Resume Voting'));
  apiMock.expectTransitionPolls('resume_voting');
  apiMock.expectGetPollsInfo('polls_open', {
    type: 'resume_voting',
  });
  await screen.findByText('Voting resumed.');

  await expectPrint((printedElement) => {
    // Check heading
    printedElement.getByText(
      'Test Voting Resumed Report for Center Springfield'
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

test('polls closed from paused', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
  });
  apiMock.expectGetPollsInfo('polls_paused');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  renderApp({
    connectPrinter: true,
    precinctReportDestination: 'laser-printer',
  });
  await screen.findByText('Polls Paused');

  // Close the polls
  apiMock.expectGetScannerResultsByParty(GENERAL_ELECTION_RESULTS);
  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'polls_closing' });
  apiMock.authenticateAsPollWorker(electionDefinition);
  await screen.findByText('Do you want to resume voting?');
  userEvent.click(screen.getByText('No'));
  apiMock.expectTransitionPolls('close_polls');
  apiMock.expectGetPollsInfo('polls_closed_final');
  userEvent.click(await screen.findByText('Close Polls'));
  await screen.findByText('Polls are closed.');

  await expectPrint((printedElement) => {
    printedElement.getByText('Test Polls Closed Report for All Precincts');
    printedElement.getByText('General Election:');
    within(printedElement.getByTestId('total-ballots')).getByText('100');
    expect(printedElement.getAllByTestId(/results-table-/)).toHaveLength(
      electionDefinition.election.contests.length
    );
    within(printedElement.getByTestId('president-barchi-hallaren')).getByText(
      '70'
    );
  });
});

test('must have printer attached to open polls (thermal printer)', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  const { hardware } = renderApp({
    connectPrinter: false,
    precinctReportDestination: 'thermal-sheet-printer',
  });
  await screen.findByText('Polls Closed');

  // Opening the polls should require a printer
  apiMock.expectGetScannerResultsByParty(GENERAL_ELECTION_RESULTS);
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
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 2 });
  const { hardware } = renderApp({
    connectPrinter: false,
    precinctReportDestination: 'thermal-sheet-printer',
  });
  await screen.findByText(/Insert Your Ballot/);

  // Opening the polls should require a printer
  apiMock.expectGetScannerResultsByParty(GENERAL_ELECTION_RESULTS);
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
