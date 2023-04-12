import {
  advanceTimers,
  advanceTimersAndPromises,
  expectPrint,
  getZeroCompressedTally,
  hasTextAcrossElements,
  PrintRenderResult,
} from '@votingworks/test-utils';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
  ReportSourceMachineType,
  ScannerBallotCountReportData,
  ScannerTallyReportData,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
  electionPrimaryNonpartisanContestsFixtures,
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  CandidateContestWithoutWriteInsCompressedTally,
  CandidateContestWithWriteInsCompressedTally,
  CompressedTally,
  ContestId,
  Dictionary,
  YesNoContestCompressedTally,
} from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '../test/react_testing_library';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { buildApp } from '../test/helpers/build_app';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

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

function expectEmptyContestResultsInReport(
  container: HTMLElement,
  contestId: ContestId
): void {
  const table = within(container).getByTestId(`results-table-${contestId}`);
  within(table).getByText(/0 ballots/);
  within(table).getByText(/0 undervotes/);
  within(table).getByText(/0 overvotes/);
  expect(within(table).queryByText(/^(?!0$)\d+$/)).not.toBeInTheDocument();
}

async function printPollsClosedReport() {
  await screen.findByText('Polls Closed Report on Card');
  userEvent.click(screen.getByText('Close Polls and Print Report'));

  // check that print starts and finishes
  await screen.findByText('Printing polls closed report');
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await waitForElementToBeRemoved(() =>
    screen.queryByText('Printing polls closed report')
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

function checkPollsOpenedReport(printedElement: PrintRenderResult) {
  const generalReport = printedElement.getByTestId('tally-report-undefined-23');
  within(generalReport).getByText(
    'Official Polls Opened Report for Center Springfield'
  );
  expectEmptyContestResultsInReport(generalReport, 'president');
  expectEmptyContestResultsInReport(generalReport, 'senator');
  expectEmptyContestResultsInReport(generalReport, 'governor');
}

test('full polls flow with tally reports - general, single precinct', async () => {
  const { electionHash } = electionSampleDefinition;
  const { renderApp, storage, logger } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');
  const precinctSelection = singlePrecinctSelectionFor('23');

  // Opening Polls
  const pollsOpenCardTallyReport: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: getZeroCompressedTally(electionSample),
    totalBallotsScanned: 0,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection,
    isLiveMode: true,
    pollsTransition: 'open_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsOpenCardTallyReport),
  });
  await screen.findByText('Polls Opened Report on Card');
  screen.getByText(/contains a polls opened report/);
  screen.getByText(/the polls will be open on VxMark/);
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  userEvent.click(screen.getByText('Open Polls and Print Report'));
  await screen.findByText('Printing polls opened report');
  await expectPrint(checkPollsOpenedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Opened Report Printed');
  screen.getByText(
    'The polls are now open. If needed, you may print additional copies of the polls opened report.'
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    expect.anything()
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPrinted,
    'poll_worker',
    expect.objectContaining({
      message:
        'Printed 2 copies of a polls opened report for Center Springfield exported from scanner 001.',
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportClearedFromCard,
    'poll_worker',
    expect.anything()
  );
  userEvent.click(screen.getByText('Print Additional Report'));
  await screen.findByText('Printing polls opened report');
  await expectPrint(checkPollsOpenedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Opened Report Printed');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPrinted,
    'poll_worker',
    expect.objectContaining({
      message:
        'Printed 1 copies of a polls opened report for Center Springfield exported from scanner 001.',
    })
  );
  userEvent.click(screen.getByText('Continue'));
  screen.getByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');

  // Pausing Voting
  const votingPausedTime = new Date('2022-10-31T16:23:00.000Z').getTime();
  const votingPausedCardBallotCountReport: ScannerBallotCountReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: votingPausedTime,
    timePollsTransitioned: votingPausedTime,
    precinctSelection,
    isLiveMode: true,
    pollsTransition: 'pause_voting',
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(votingPausedCardBallotCountReport),
  });
  await screen.findByText('Voting Paused Report on Card');
  screen.getByText(/contains a voting paused report/);
  screen.getByText(/the polls will be paused on VxMark/);
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  userEvent.click(screen.getByText('Pause Voting and Print Report'));
  await screen.findByText('Printing voting paused report');
  function checkVotingPausedReport(printedElement: PrintRenderResult) {
    // Check heading
    printedElement.getByText(
      'Official Voting Paused Report for Center Springfield'
    );
    printedElement.getByText('Voting Paused:');
    // Check contents
    printedElement.getByText(hasTextAcrossElements('Ballots Scanned Count3'));
    printedElement.getByText(hasTextAcrossElements('Polls StatusPaused'));
    printedElement.getByText(
      hasTextAcrossElements('Time Voting PausedMon, Oct 31, 2022, 4:23 PM')
    );
  }
  await expectPrint(checkVotingPausedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Voting Paused Report Printed');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    expect.anything()
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPrinted,
    'poll_worker',
    expect.objectContaining({
      message:
        'Printed 2 copies of a voting paused report for Center Springfield exported from scanner 001.',
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportClearedFromCard,
    'poll_worker',
    expect.anything()
  );
  userEvent.click(screen.getByText('Print Additional Report'));
  await screen.findByText('Printing voting paused report');
  await expectPrint(checkVotingPausedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Voting Paused Report Printed');
  userEvent.click(screen.getByText('Continue'));
  screen.getByText(hasTextAcrossElements('Polls: Paused'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting Paused');

  // Resuming Voting
  const votingResumedTime = new Date('2022-10-31T16:23:00.000Z').getTime();
  const votingResumedCardBallotCountReport: ScannerBallotCountReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: votingResumedTime,
    timePollsTransitioned: votingResumedTime,
    precinctSelection,
    isLiveMode: true,
    pollsTransition: 'resume_voting',
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(votingResumedCardBallotCountReport),
  });
  await screen.findByText('Voting Resumed Report on Card');
  screen.getByText(/contains a voting resumed report/);
  screen.getByText(/the polls will be open on VxMark/);
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  userEvent.click(screen.getByText('Resume Voting and Print Report'));
  await screen.findByText('Printing voting resumed report');
  function checkVotingResumedReport(printedElement: PrintRenderResult) {
    // Check heading
    printedElement.getByText(
      'Official Voting Resumed Report for Center Springfield'
    );
    printedElement.getByText('Voting Resumed:');
    // Check contents
    printedElement.getByText(hasTextAcrossElements('Ballots Scanned Count3'));
    printedElement.getByText(hasTextAcrossElements('Polls StatusOpen'));
    printedElement.getByText(
      hasTextAcrossElements('Time Voting ResumedMon, Oct 31, 2022, 4:23 PM')
    );
  }
  await expectPrint(checkVotingResumedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Voting Resumed Report Printed');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    expect.anything()
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPrinted,
    'poll_worker',
    expect.objectContaining({
      message:
        'Printed 2 copies of a voting resumed report for Center Springfield exported from scanner 001.',
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportClearedFromCard,
    'poll_worker',
    expect.anything()
  );
  userEvent.click(screen.getByText('Print Additional Report'));
  await screen.findByText('Printing voting resumed report');
  await expectPrint(checkVotingResumedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Voting Resumed Report Printed');
  userEvent.click(screen.getByText('Continue'));
  screen.getByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');

  // Closing Polls

  const existingTally = getZeroCompressedTally(electionSample);
  // add tallies to the president contest
  existingTally[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>([
    6 /* undervotes */, 0 /* overvotes */, 34 /* ballotsCast */,
    6 /* for 'barchi-hallaren' */, 5 /* for 'cramer-vuocolo' */,
    6 /* for 'court-blumhardt' */, 5 /* for 'boone-lian' */,
    3 /* for 'hildebrand-garritty' */, 0 /* for 'patterson-lariviere' */,
  ]);
  const pollsClosedCardTallyReport: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    talliesByPrecinct: { '23': existingTally },
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: singlePrecinctSelectionFor('23'),
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [20, 5],
    },
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsClosedCardTallyReport),
  });
  await screen.findByText('Polls Closed Report on Card');
  screen.getByText(/contains a polls closed report/);
  screen.getByText(/the polls will be closed on VxMark/);
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  userEvent.click(screen.getByText('Close Polls and Print Report'));
  await screen.findByText('Printing polls closed report');
  function checkPollsClosedReport(printedElement: PrintRenderResult) {
    const generalReport = printedElement.getByTestId(
      'tally-report-undefined-23'
    );
    within(generalReport).getByText(
      'Official Polls Closed Report for Center Springfield'
    );
    expectBallotCountsInReport(generalReport, 20, 5, 25);
    expectContestResultsInReport(
      generalReport,
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
    expectEmptyContestResultsInReport(generalReport, 'senator');
    expectEmptyContestResultsInReport(generalReport, 'governor');
  }
  await expectPrint(checkPollsClosedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Closed Report Printed');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsClosed,
    'poll_worker',
    expect.anything()
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPrinted,
    'poll_worker',
    expect.objectContaining({
      message:
        'Printed 2 copies of a polls closed report for Center Springfield exported from scanner 001.',
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportClearedFromCard,
    'poll_worker',
    expect.anything()
  );
  userEvent.click(screen.getByText('Print Additional Report'));
  await screen.findByText('Printing polls closed report');
  await expectPrint(checkPollsClosedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Closed Report Printed');
  userEvent.click(screen.getByText('Continue'));
  screen.getByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
});

test('tally report: as expected with all precinct combined data for general election', async () => {
  const { electionHash } = electionSampleDefinition;
  const existingTally = getZeroCompressedTally(electionSample);
  // add tallies to the president contest
  existingTally[0] = typedAs<CandidateContestWithoutWriteInsCompressedTally>([
    6 /* undervotes */, 0 /* overvotes */, 34 /* ballotsCast */,
    6 /* for 'barchi-hallaren' */, 5 /* for 'cramer-vuocolo' */,
    6 /* for 'court-blumhardt' */, 5 /* for 'boone-lian' */,
    3 /* for 'hildebrand-garritty' */, 0 /* for 'patterson-lariviere' */,
  ]);
  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: { 'undefined,__ALL_PRECINCTS': [20, 5] },
  };
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_open' });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint((printedElement) => {
    // VxQR is turned off by default
    expect(
      printedElement.queryAllByText('Automatic Election Results Reporting')
    ).toHaveLength(0);

    const allPrecinctsReport = printedElement.getByTestId(
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
    expectEmptyContestResultsInReport(allPrecinctsReport, 'senator');
  });
});

test('tally report: as expected with all precinct specific data for general election', async () => {
  const { electionHash } = electionSampleDefinition;
  const centerSpringfield = getZeroCompressedTally(electionSample);
  const northSpringfield = getZeroCompressedTally(electionSample);
  const southSpringfield = getZeroCompressedTally(electionSample);
  const combinedTally = getZeroCompressedTally(electionSample);
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
  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: combinedTally,
    talliesByPrecinct: {
      23: centerSpringfield,
      21: northSpringfield,
      20: southSpringfield,
    },
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [20, 5],
      'undefined,23': [10, 0],
      'undefined,21': [10, 5],
      'undefined,20': [0, 0],
    },
  };

  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_open' });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint((printedElement) => {
    const centerSpringfieldReport = printedElement.getByTestId(
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

    const northSpringfieldReport = printedElement.getByTestId(
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

    const southSpringfieldReport = printedElement.getByTestId(
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
});

const primaryElectionOverallTally: CompressedTally = [
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
  typedAs<YesNoContestCompressedTally>([
    0 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
    2 /* for 'yes' */, 0 /* for 'no' */,
  ]),
  // new zoo pick one
  typedAs<YesNoContestCompressedTally>([
    1 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
    0 /* for 'yes' */, 1 /* for 'no' */,
  ]),
  // fishing ban yes no
  typedAs<YesNoContestCompressedTally>([
    0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
    0 /* for 'yes' */, 1 /* for 'no' */,
  ]),
];

function checkPrimaryElectionOverallTallyReports(
  printedElement: PrintRenderResult
) {
  // Check that the expected results are on the tally report for Mammal Party
  const allPrecinctMammalReport = printedElement.getByTestId(/tally-report-0-/);
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

  // Check that the expected results are on the tally report for Fish Party
  const allPrecinctFishReport = printedElement.getByTestId(/tally-report-1-/);
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

  // Check that the expected results are on the tally report for Nonpartisan Contests
  const allPrecinctNonpartisanReport = printedElement.getByTestId(
    /tally-report-undefined-/
  );
  expectContestResultsInReport(
    allPrecinctNonpartisanReport,
    'new-zoo-either',
    {
      ballotsCast: 2,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 2, no: 0 }
  );
  expectContestResultsInReport(
    allPrecinctNonpartisanReport,
    'new-zoo-pick',
    {
      ballotsCast: 2,
      undervotes: 1,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
  expectContestResultsInReport(
    allPrecinctNonpartisanReport,
    'fishing',
    {
      ballotsCast: 1,
      undervotes: 0,
      overvotes: 0,
    },
    { yes: 0, no: 1 }
  );
}

test('tally report: as expected with a single precinct for primary election', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { electionHash } = electionDefinition;

  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: primaryElectionOverallTally,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [1, 0],
    },
  };

  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_open',
    appPrecinct: ALL_PRECINCTS_SELECTION,
  });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint(checkPrimaryElectionOverallTallyReports);
});

test('tally report: as expected with all precinct combined data for primary election', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { electionHash } = electionDefinition;

  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: primaryElectionOverallTally,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 0],
      '0,precinct-2': [0, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [0, 0],
      '1,precinct-2': [1, 0],
    },
  };

  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_open',
    appPrecinct: ALL_PRECINCTS_SELECTION,
  });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint(checkPrimaryElectionOverallTallyReports);
});

test('tally report: as expected with all precinct specific data for primary election + VxQR', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const { electionHash } = electionDefinition;

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
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // new zoo pick one
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
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
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // new zoo pick one
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 1 /* for 'no' */,
      ]),
      // fishing ban yes no
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 1 /* for 'no' */,
      ]),
    ],
  };

  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: primaryElectionOverallTally,
    talliesByPrecinct,
    totalBallotsScanned: 3,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      '0,__ALL_PRECINCTS': [1, 1],
      '0,precinct-1': [1, 0],
      '0,precinct-2': [0, 1],
      '1,__ALL_PRECINCTS': [1, 0],
      '1,precinct-1': [0, 0],
      '1,precinct-2': [1, 0],
    },
  };

  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_open',
    appPrecinct: ALL_PRECINCTS_SELECTION,
  });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint((printedElement) => {
    // VxQR check
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

    // Check that the expected results are on the tally report for Precinct 1 Nonpartisan Contests
    const precinct1NonpartisanReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-1'
    );
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'new-zoo-either',
      {
        ballotsCast: 1,
        undervotes: 0,
        overvotes: 0,
      },
      { yes: 1, no: 0 }
    );
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'new-zoo-pick',
      {
        ballotsCast: 1,
        undervotes: 1,
        overvotes: 0,
      },
      { yes: 0, no: 0 }
    );
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'fishing',
      { ballotsCast: 0, undervotes: 0, overvotes: 0 },
      { yes: 0, no: 0 }
    );

    // Check that the expected results are on the tally report for Precinct 2 Nonpartisan Contests
    const precinct2NonpartisanReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-2'
    );
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'new-zoo-either',
      {
        ballotsCast: 1,
        undervotes: 0,
        overvotes: 0,
      },
      { yes: 1, no: 0 }
    );
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'new-zoo-pick',
      {
        ballotsCast: 1,
        undervotes: 0,
        overvotes: 0,
      },
      { yes: 0, no: 1 }
    );
    expectContestResultsInReport(
      precinct2NonpartisanReport,
      'fishing',
      { ballotsCast: 1, undervotes: 0, overvotes: 0 },
      { yes: 0, no: 1 }
    );
  });
});

test('tally report: as expected with primary election with nonpartisan contests', async () => {
  const { electionDefinition, election } =
    electionPrimaryNonpartisanContestsFixtures;
  const { electionHash } = electionDefinition;

  const tally: CompressedTally = [
    // best animal mammal
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      2 /* for 'horse' */, 0 /* for 'otter' */, 0 /* for 'fox' */,
      0 /* writeIns */,
    ]),
    // best animal fish
    typedAs<CandidateContestWithoutWriteInsCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      2 /* for 'seahorse' */, 0 /* for 'salmon' */, 0 /* writeIns */,
    ]),
    // zoo council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      6 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
      0 /* for 'elephant' */, 0 /* writeIns */,
    ]),
    // aquarium council
    typedAs<CandidateContestWithWriteInsCompressedTally>([
      4 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'manta-ray' */, 0 /* for 'pufferfish' */, 0 /* for 'rockfish' */,
      0 /* for 'triggerfish' */, 0 /* writeIns */,
    ]),
    // new zoo either neither
    typedAs<YesNoContestCompressedTally>([
      2 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'yes' */, 0 /* for 'no' */,
    ]),
    // new zoo pick one
    typedAs<YesNoContestCompressedTally>([
      2 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'yes' */, 0 /* for 'no' */,
    ]),
    // fishing ban yes no
    typedAs<YesNoContestCompressedTally>([
      2 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
      0 /* for 'yes' */, 0 /* for 'no' */,
    ]),
    // kingdom preference yes no
    typedAs<YesNoContestCompressedTally>([
      0 /* undervotes */, 0 /* overvotes */, 4 /* ballotsCast */,
      2 /* for 'yes' */, 2 /* for 'no' */,
    ]),
  ];

  const talliesByPrecinct: Dictionary<CompressedTally> = {
    'precinct-1': [
      // best animal mammal
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'horse' */, 0 /* for 'otter' */, 0 /* for 'fox' */,
        0 /* writeIns */,
      ]),
      // best animal fish
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'seahorse' */, 0 /* for 'salmon' */, 0 /* writeIns */,
      ]),
      // zoo council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        3 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
        0 /* for 'elephant' */, 0 /* writeIns */,
      ]),
      // aquarium council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        2 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'manta-ray' */, 0 /* for 'pufferfish' */,
        0 /* for 'rockfish' */, 0 /* for 'triggerfish' */, 0 /* writeIns */,
      ]),
      // new zoo either neither
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // new zoo pick one
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // fishing ban yes no
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // kingdom preference yes no
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
        1 /* for 'yes' */, 1 /* for 'no' */,
      ]),
    ],
    'precinct-2': [
      // best animal mammal
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'horse' */, 0 /* for 'otter' */, 0 /* for 'fox' */,
        0 /* writeIns */,
      ]),
      // best animal fish
      typedAs<CandidateContestWithoutWriteInsCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        1 /* for 'seahorse' */, 0 /* for 'salmon' */, 0 /* writeIns */,
      ]),
      // zoo council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        3 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'zebra' */, 0 /* for 'lion' */, 0 /* for 'kangaroo' */,
        0 /* for 'elephant' */, 0 /* writeIns */,
      ]),
      // aquarium council
      typedAs<CandidateContestWithWriteInsCompressedTally>([
        2 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'manta-ray' */, 0 /* for 'pufferfish' */,
        0 /* for 'rockfish' */, 0 /* for 'triggerfish' */, 0 /* writeIns */,
      ]),
      // new zoo either neither
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // new zoo pick one
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // fishing ban yes no
      typedAs<YesNoContestCompressedTally>([
        1 /* undervotes */, 0 /* overvotes */, 1 /* ballotsCast */,
        0 /* for 'yes' */, 0 /* for 'no' */,
      ]),
      // kingdom preference yes no
      typedAs<YesNoContestCompressedTally>([
        0 /* undervotes */, 0 /* overvotes */, 2 /* ballotsCast */,
        1 /* for 'yes' */, 1 /* for 'no' */,
      ]),
    ],
  };

  const tallyOnCard: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally,
    talliesByPrecinct,
    totalBallotsScanned: 4,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      '0,precinct-1': [1, 0],
      '0,precinct-2': [1, 0],
      '1,precinct-1': [1, 0],
      '1,precinct-2': [1, 0],
      'undefined,precinct-1': [2, 0],
      'undefined,precinct-2': [2, 0],
      '0,__ALL_PRECINCTS': [2, 0],
      '1,__ALL_PRECINCTS': [2, 0],
    },
  };

  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_open',
    appPrecinct: ALL_PRECINCTS_SELECTION,
  });
  renderApp();
  await screen.findByText('Insert Card');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    scannerReportDataReadResult: ok(tallyOnCard),
  });

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  await printPollsClosedReport();

  await expectPrint((printedElement) => {
    expect(
      printedElement.getAllByText('Official Polls Closed Report for Precinct 1')
    ).toHaveLength(election.parties.length + 1);
    expect(
      printedElement.getAllByText('Official Polls Closed Report for Precinct 2')
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

    // Check that the expected results are on the tally report for Precinct 1 Mammal Party
    const precinct1MammalReport = printedElement.getByTestId(
      'tally-report-0-precinct-1'
    );
    expectBallotCountsInReport(precinct1MammalReport, 1, 0, 1);
    expect(
      within(precinct1MammalReport).queryByTestId('results-table-kingdom')
    ).toBeFalsy();
    expectContestResultsInReport(
      precinct1MammalReport,
      'best-animal-mammal',
      {
        ballotsCast: 1,
        undervotes: 0,
        overvotes: 0,
      },
      { horse: 1, otter: 0, fox: 0 }
    );

    // Check that the expected results are on the tally report for nonpartisan contests
    const precinct1NonpartisanReport = printedElement.getByTestId(
      'tally-report-undefined-precinct-1'
    );
    expectBallotCountsInReport(precinct1NonpartisanReport, 2, 0, 2);
    expect(
      within(precinct1NonpartisanReport).queryByTestId(
        'results-table-best-animal-mammal'
      )
    ).toBeFalsy();
    expectContestResultsInReport(
      precinct1NonpartisanReport,
      'kingdom',
      {
        ballotsCast: 2,
        undervotes: 0,
        overvotes: 0,
      },
      { yes: 1, no: 1 }
    );
  });
});

test('tally report: will print but not update polls state appropriate', async () => {
  const { electionHash } = electionSampleDefinition;
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  // The polls have already been closed
  await setStateInStorage(storage, { pollsState: 'polls_closed_final' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
  const precinctSelection = singlePrecinctSelectionFor('23');

  // Opening Polls
  const pollsOpenCardTallyReport: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: getZeroCompressedTally(electionSample),
    totalBallotsScanned: 0,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection,
    isLiveMode: true,
    pollsTransition: 'open_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsOpenCardTallyReport),
  });
  await screen.findByText('Polls Opened Report on Card');
  screen.getByText(
    'This poll worker card contains a polls opened report. After printing, the report will be cleared from the card.'
  );
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(undefined));
  userEvent.click(screen.getByText('Print Report'));
  await expectPrint(checkPollsOpenedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Opened Report Printed');
  userEvent.click(screen.getByText('Print Additional Report'));
  await screen.findByText('Printing polls opened report');
  await expectPrint(checkPollsOpenedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Opened Report Printed');
  screen.getByText(
    'If needed, you may print additional copies of the polls opened report.'
  );
  userEvent.click(screen.getByText('Continue'));
  // Polls should still be closed
  screen.getByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
});

test('full polls flow without tally reports', async () => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(null);
  const { renderApp, storage, logger } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // Open Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  userEvent.click(screen.getByText('Open Polls'));
  await screen.findByText('No Polls Opened Report on Card');
  userEvent.click(screen.getByText('Open Polls on VxMark Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    expect.anything()
  );

  // Pause Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Pause Voting'));
  await screen.findByText('No Voting Paused Report on Card');
  userEvent.click(screen.getByText('Pause Voting on VxMark Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting Paused');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    expect.anything()
  );

  // Resume Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  userEvent.click(screen.getByText('Resume Voting'));
  await screen.findByText('No Voting Resumed Report on Card');
  userEvent.click(screen.getByText('Resume Voting on VxMark Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    expect.anything()
  );

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  await screen.findByText('No Polls Closed Report on Card');
  userEvent.click(screen.getByText('Close Polls on VxMark Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsClosed,
    'poll_worker',
    expect.anything()
  );
});

test('can close from paused without tally report', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_paused' });
  renderApp();
  await screen.findByText('Voting Paused');
  screen.getByText('Insert Poll Worker card to resume voting.');

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  userEvent.click(screen.getByText('Close Polls'));
  await screen.findByText('No Polls Closed Report on Card');
  userEvent.click(screen.getByText('Close Polls on VxMark Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
});

test('no buttons to change polls from closed final', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_final' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  expect(
    screen.queryByRole('button', { name: /open/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /pause/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /close/i })
  ).not.toBeInTheDocument();
});

test('can reset polls to paused with system administrator card', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_final' });
  renderApp();
  await screen.findByText('Polls Closed');
  apiMock.setAuthStatusSystemAdministratorLoggedIn();

  userEvent.click(await screen.findByText('Reset Polls to Paused'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    await within(modal).findByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(screen.getButton('Reset Polls to Paused')).toBeDisabled();

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting Paused');
});

test('will not try to print report or change polls if report on card is in wrong mode', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_closed_initial',
    isLiveMode: true,
  });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');
  const precinctSelection = singlePrecinctSelectionFor('23');

  // Closed polls report from L&A left on card
  const pollsOpenCardTallyReport: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: getZeroCompressedTally(electionSample),
    totalBallotsScanned: 0,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection,
    isLiveMode: false,
    pollsTransition: 'close_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsOpenCardTallyReport),
  });
  await screen.findByText('Poll Worker Actions');

  // Must advance timers to allow time for card tally to load
  await advanceTimersAndPromises(1);
  expect(screen.queryByRole('alertdialog')).toBeFalsy();
});

test('cannot close polls from closed report on card if polls have not been opened', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();
  await screen.findByText('Polls Closed');
  const precinctSelection = singlePrecinctSelectionFor('23');

  // Polls closed report on card
  const pollsClosedCardTallyReport: ScannerTallyReportData = {
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    tally: getZeroCompressedTally(electionSample),
    totalBallotsScanned: 0,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    precinctSelection,
    isLiveMode: true,
    pollsTransition: 'close_polls',
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
  };

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsClosedCardTallyReport),
  });
  await screen.findByText('Polls Closed Report on Card');
  screen.getByRole('button', { name: 'Print Report' });
  expect(
    screen.queryByRole('button', { name: 'Print Report and Close Polls' })
  ).not.toBeInTheDocument();
});

test('error clearing report from card does not affect printing and is logged', async () => {
  const { electionHash } = electionSampleDefinition;
  const { logger, renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();

  await screen.findByText('Polls Closed');
  const pollsOpenedReport: ScannerTallyReportData = {
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
    isLiveMode: true,
    machineId: '001',
    pollsTransition: 'open_polls',
    precinctSelection: singlePrecinctSelectionFor('23'),
    tally: getZeroCompressedTally(electionSample),
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    timeSaved: new Date('2020-10-31').getTime(),
    totalBallotsScanned: 0,
  };
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsOpenedReport),
  });
  await screen.findByText('Polls Opened Report on Card');

  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(err(new Error('Error clearing report from card')));
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok(pollsOpenedReport));
  userEvent.click(screen.getByText('Open Polls and Print Report'));
  await screen.findByText('Printing polls opened report');
  await expectPrint(checkPollsOpenedReport);
  advanceTimers(REPORT_PRINTING_TIMEOUT_SECONDS);
  await screen.findByText('Polls Opened Report Printed');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportClearedFromCard,
    'poll_worker',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('inserting two poll worker cards, one with a report and one without', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();

  await screen.findByText('Polls Closed');
  const pollsOpenedReport: ScannerTallyReportData = {
    ballotCounts: {
      'undefined,__ALL_PRECINCTS': [0, 0],
      'undefined,23': [0, 0],
    },
    isLiveMode: true,
    machineId: '001',
    pollsTransition: 'open_polls',
    precinctSelection: singlePrecinctSelectionFor('23'),
    tally: getZeroCompressedTally(electionSample),
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    timePollsTransitioned: new Date('2020-10-31').getTime(),
    timeSaved: new Date('2020-10-31').getTime(),
    totalBallotsScanned: 0,
  };
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(pollsOpenedReport),
  });
  await screen.findByText('Polls Opened Report on Card');

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Poll Worker card to open.');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: ok(undefined),
  });
  await screen.findByText('Poll Worker Actions');
  expect(
    screen.queryByText('Polls Opened Report on Card')
  ).not.toBeInTheDocument();
});
