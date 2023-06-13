import MockDate from 'mockdate';
import userEvent from '@testing-library/user-event';
import fetchMock from 'fetch-mock';
import {
  electionWithMsEitherNeitherFixtures,
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import {
  advanceTimers,
  advanceTimersAndPromises,
  expectPrint,
  expectPrintToMatchSnapshot,
  fakeElectionManagerUser,
  fakeKiosk,
  fakePrinterInfo,
  fakeSessionExpiresAt,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { VotingMethod } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import {
  convertTalliesByPrecinctToFullManualTally,
  getEmptyManualTalliesByPrecinct,
  buildSpecificManualTally,
} from '@votingworks/utils';
import {
  fireEvent,
  screen,
  waitFor,
  act,
  within,
} from '../test/react_testing_library';

import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { VxFiles } from './lib/converters';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';
import { mockCastVoteRecordFileRecord } from '../test/api_mock_data';
import { fileDataToCastVoteRecords } from '../test/util/cast_vote_records';

const EITHER_NEITHER_CVR_DATA =
  electionWithMsEitherNeitherFixtures.legacyCvrData;

jest.mock('./components/hand_marked_paper_ballot');
jest.mock('./utils/pdf_to_images');
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
    encodeBallot: () => new Uint8Array(),
  };
});

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;
let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: jest.fn() },
  });
  window.location.href = '/';

  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();

  MockDate.set(new Date('2020-11-03T22:22:00'));
  fetchMock.reset();
  fetchMock.get(
    '/convert/election/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
});

afterEach(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('configuring with a demo election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetFullElectionManualTally();

  const { getByText } = renderApp();

  await apiMock.authenticateAsSystemAdministrator();
  await screen.findByText('Load Demo Election Definition');

  // expecting configure and resulting refetch
  apiMock.expectConfigure(electionDefinition.electionData);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  fireEvent.click(screen.getByText('Load Demo Election Definition'));

  await screen.findByText('Election Definition');

  // You can view the Logs screen and save log files when there is an election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save CDF Log File'));
  await screen.findByText('No Log File Present');

  fireEvent.click(getByText('Definition'));

  fireEvent.click(getByText('View Definition JSON'));

  // remove the election
  apiMock.expectUnconfigure();
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetFullElectionManualTally();
  fireEvent.click(getByText('Remove'));
  fireEvent.click(getByText('Remove Election Definition'));

  await screen.findByText('Configure VxAdmin');

  // You can view the Logs screen and save log files when there is no election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save CDF Log File'));
  // You can not save as CDF when there is no election.
  expect(screen.queryAllByText('No Log File Present')).toHaveLength(0);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByText('Load Demo Election Definition');
});

test('authentication works', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp, hardware } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await screen.findByText('VxAdmin is Locked');

  // Disconnect card reader
  act(() => hardware.setCardReaderConnected(false));
  await screen.findByText('Card Reader Not Detected');
  act(() => hardware.setCardReaderConnected(true));
  await screen.findByText('VxAdmin is Locked');

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
  });
  await screen.findByText('Enter the card PIN to unlock.');
  apiMock.expectCheckPin('111111');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
    wrongPinEnteredAt: new Date(),
  });
  await screen.findByText('Incorrect PIN. Please try again.');

  // Remove card and insert an invalid card, e.g. a pollworker card.
  await apiMock.logOut();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText('Invalid Card');
  await apiMock.logOut();

  // Insert election manager card and enter correct PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
  });
  await screen.findByText('Enter the card PIN to unlock.');
  apiMock.expectCheckPin('123456');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText('Remove card to continue.');

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText('Lock Machine');

  // Lock the machine
  apiMock.expectLogOut();
  fireEvent.click(screen.getByText('Lock Machine'));
  await apiMock.logOut();
});

test('L&A (logic and accuracy) flow', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp, logger } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
  });
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetCastVoteRecordFileMode('unlocked');

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getByText('L&A'));

  // Test printing L&A package
  userEvent.click(await screen.findButton('List Precinct L&A Packages'));
  userEvent.click(await screen.findButton('Print District 5'));

  // L&A package: Tally report
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckTallyReportPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  advanceTimers(5);

  // L&A package: BMD test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  expect(logger.log).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      message: expect.stringContaining('BMD paper ballot test deck'),
    })
  );
  advanceTimers(30);

  // L&A package: HMPB test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  expect(logger.log).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      message: expect.stringContaining('Hand-marked paper ballot test deck'),
    })
  );

  // Test printing full test deck tally
  userEvent.click(screen.getByText('L&A'));
  userEvent.click(screen.getByText('Print Full Test Deck Tally Report'));

  await screen.findByText('Printing');
  const expectedTallies: { [tally: string]: number } = {
    '104': 10,
    '52': 12,
    '24': 6,
    '12': 4,
    '8': 3,
    '4': 2,
  };
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText(
      'Test Deck Mock General Election Choctaw 2020 Tally Report'
    );
    for (const [tally, times] of Object.entries(expectedTallies)) {
      expect(printedElement.getAllByText(tally).length).toEqual(times);
    }
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TestDeckTallyReportPrinted,
    expect.any(String),
    expect.anything()
  );
});

test('marking results as official', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
  });
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetWriteInTalliesAdjudicated([]);
  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);
  userEvent.click(screen.getButton('Reports'));
  userEvent.click(screen.getButton('Unofficial Full Election Tally Report'));
  await screen.findByText('Unofficial Example Primary Election Tally Report');

  apiMock.expectMarkResultsOfficial();
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  await waitFor(() => {
    expect(screen.getButton('Mark Tally Results as Official')).toBeEnabled();
  });
  userEvent.click(screen.getButton('Mark Tally Results as Official'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getButton(
      'Mark Tally Results as Official'
    )
  );
  await screen.findByText('Official Example Primary Election Tally Report');
});

test('tabulating CVRs', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp, logger } = buildApp(apiMock, 'ms-sems');
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(EITHER_NEITHER_CVR_DATA, electionDefinition)
  );
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetWriteInTalliesAdjudicated([]);
  apiMock.expectGetSemsExportableTallies({ talliesByPrecinct: {} });
  const { getByText, getAllByText, getByTestId } = renderApp();

  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  fireEvent.click(getByText('Reports'));
  expect(getByTestId('total-ballot-count').textContent).toEqual('100');

  fireEvent.click(getByText('Official Full Election Tally Report'));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TallyReportPreviewed,
    expect.any(String),
    expect.anything()
  );

  // Report title should be rendered 2 times - app and preview
  await waitFor(() => {
    expect(
      getAllByText('Official Mock General Election Choctaw 2020 Tally Report')
        .length
    ).toEqual(2);
  });

  userEvent.click(screen.getByText('Print Report'));
  await screen.findByText('Printing');
  // Snapshot printed report to detect changes in results or formatting
  await expectPrintToMatchSnapshot();

  fireEvent.click(getByText('Reports'));
  fireEvent.click(getByText('Show Results by Batch and Scanner'));
  fireEvent.click(getByText('Official Batch 2 Tally Report'));
  getByText('Official Batch Tally Report for Batch 2 (Scanner: scanner-1)');
  const reportPreview = getByTestId('report-preview');
  const totalRow = within(reportPreview).getByTestId('total');
  expect(totalRow).toHaveTextContent('4');

  fireEvent.click(getByText('Back to Reports'));

  await waitFor(() => {
    fireEvent.click(getByText('Official Tally Reports for All Precincts'));
  });

  getByText(
    'Official Mock General Election Choctaw 2020 Tally Reports for All Precincts'
  );
  // Test that each precinct has a tally report generated in the preview
  for (const p of eitherNeitherElectionDefinition.election.precincts) {
    getByText(`Official Precinct Tally Report for: ${p.name}`);
  }
  // The election title is written once for each precinct the preview, and in
  // the footer of the page
  expect(getAllByText('Mock General Election Choctaw 2020').length).toEqual(
    eitherNeitherElectionDefinition.election.precincts.length + 1
  );
});

test('manual tally data appears in reporting', async () => {
  const electionDefinition = electionWithMsEitherNeitherDefinition;
  const { election } = electionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(EITHER_NEITHER_CVR_DATA, electionDefinition)
  );
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: false,
  });

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetWriteInTalliesAdjudicated([]);

  const district5ManualTally = buildSpecificManualTally(election, 100, {
    '775020876': {
      undervotes: 12,
      overvotes: 8,
      ballots: 100,
      officialOptionTallies: {
        '775031988': 32,
        '775031987': 28,
        '775031989': 20,
      },
    },
  });
  const talliesByPrecinct = getEmptyManualTalliesByPrecinct(election);
  talliesByPrecinct['6522'] = district5ManualTally;
  apiMock.expectGetFullElectionManualTally(
    convertTalliesByPrecinctToFullManualTally(
      talliesByPrecinct,
      eitherNeitherElectionDefinition.election,
      VotingMethod.Precinct,
      new Date()
    )
  );

  renderApp();

  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getByText('Reports'));
  screen.getByText('Manually Entered Results');
  expect(screen.getByTestId('total-ballot-count').textContent).toEqual('200');

  userEvent.click(screen.getByText('Unofficial Full Election Tally Report'));
  // Report title should be rendered 2 times - app and preview
  expect(
    screen.getAllByText(
      'Unofficial Mock General Election Choctaw 2020 Tally Report'
    ).length
  ).toEqual(2);

  const reportPreview = screen.getByTestId('report-preview');
  within(reportPreview).getByText(
    'Unofficial Mock General Election Choctaw 2020 Tally Report'
  );
  const absenteeRow = within(reportPreview).getByTestId('absentee');
  within(absenteeRow).getByText('Absentee');
  within(absenteeRow).getByText('50');

  const precinctRow = within(reportPreview).getByTestId('standard');
  within(precinctRow).getByText('Precinct');
  within(precinctRow).getByText('150');

  const totalRow = within(reportPreview).getByTestId('total');
  within(totalRow).getByText('Total Ballots Cast');
  within(totalRow).getByText('200');
});

test('reports screen shows appropriate summary data about ballot counts', async () => {
  const { electionDefinition, legacyCvrData } =
    electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(legacyCvrData, electionDefinition)
  );
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  const manualTally = convertTalliesByPrecinctToFullManualTally(
    { 'precinct-1': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    new Date()
  );
  apiMock.expectGetFullElectionManualTally(manualTally);
  apiMock.expectGetCastVoteRecordFileMode('test');

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getByText('Reports'));

  // total ballot count combination of manual and cast vote record data
  await waitFor(() =>
    expect(screen.getAllByTestId('total-ballot-count')[0].textContent).toEqual(
      '3,100'
    )
  );
});

test('removing election resets cvr and manual data files', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  const manualTally = convertTalliesByPrecinctToFullManualTally(
    { 'precinct-1': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Absentee,
    new Date()
  );
  apiMock.expectGetFullElectionManualTally(manualTally);

  const { getByText } = renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  await apiMock.logOut();
  await apiMock.authenticateAsSystemAdministrator();

  // expect all data to be refetched on unconfigure
  apiMock.expectUnconfigure();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetFullElectionManualTally();
  fireEvent.click(getByText('Definition'));
  fireEvent.click(getByText('Remove Election'));
  fireEvent.click(getByText('Remove Election Definition'));
});

test('clearing results', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  apiMock.expectGetCastVoteRecordFiles([
    { ...mockCastVoteRecordFileRecord, numCvrsImported: 3000 },
  ]);
  apiMock.expectGetCastVoteRecordFileMode('test');

  const manualTally = convertTalliesByPrecinctToFullManualTally(
    { 'precinct-1': { contestTallies: {}, numberOfBallotsCounted: 100 } },
    eitherNeitherElectionDefinition.election,
    VotingMethod.Precinct,
    new Date()
  );
  apiMock.expectGetFullElectionManualTally(manualTally);
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      ballotCount: 100,
      createdAt: new Date().toISOString(),
    },
  ]);

  const { getByText, queryByText } = renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  fireEvent.click(getByText('Tally'));
  expect(
    (await screen.findByText('Load CVR Files')).closest('button')
  ).toBeDisabled();
  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(
    getByText('Edit Manually Entered Results').closest('button')
  ).toBeDisabled();
  expect(
    getByText('Remove Manually Entered Results').closest('button')
  ).toBeDisabled();

  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetFullElectionManualTally();

  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetManualResultsMetadata([]);
  fireEvent.click(getByText('Clear All Tallies and Results'));
  getByText(
    'Do you want to remove the 1 loaded CVR file and the manually entered data?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() => {
    expect(getByText('Load CVR Files').closest('button')).toBeEnabled();
  });
  await waitFor(() => {
    expect(
      getByText('Add Manually Entered Results').closest('button')
    ).toBeEnabled();
  });

  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(
    getByText('Remove Manually Entered Results').closest('button')
  ).toBeDisabled();

  expect(queryByText('Clear All Tallies and Results')).not.toBeInTheDocument();

  getByText('No CVR files loaded.');
});

test('can not view or print ballots', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;

  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();
  expect(
    within(screen.getByRole('navigation')).queryByRole('button', {
      name: 'Ballots',
    })
  ).not.toBeInTheDocument();

  await apiMock.logOut();
  await apiMock.authenticateAsElectionManager(electionDefinition);
  screen.getByText('Save Ballot Package');
});

test('election manager UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetManualResultsMetadata([]);
  renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getByText('L&A'));
  await screen.findByRole('heading', { name: 'L&A Testing Documents' });

  userEvent.click(screen.getByText('Tally'));
  await screen.findByRole('heading', {
    name: 'Cast Vote Record (CVR) Management',
  });

  userEvent.click(screen.getByText('Reports'));
  await screen.findByRole('heading', { name: 'Election Reports' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Definition')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
});

test('system administrator UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetFullElectionManualTally();
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Election Definition' });
  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('system administrator UI has expected nav when no election', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();

  // Create an election definition and verify that previously hidden tabs appear
  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectConfigure(electionDefinition.electionData);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(
    screen.getByRole('button', { name: 'Load Demo Election Definition' })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Configure VxAdmin' })
    ).not.toBeInTheDocument()
  );
  screen.getByText('Smartcards');

  // Remove the election definition and verify that those same tabs disappear
  apiMock.expectUnconfigure();
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetFullElectionManualTally();
  userEvent.click(screen.getByText('Remove Election'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Remove Election Definition' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await waitFor(() =>
    expect(screen.queryByText('Smartcards')).not.toBeInTheDocument()
  );
});

test('system administrator Smartcards screen navigation', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });
  userEvent.click(screen.getByText('Create Election Cards'));
  await screen.findByRole('heading', { name: 'Election Cards' });

  // The smartcard modal and smartcard programming flows are tested in smartcard_modal.test.tsx
});

test('election manager cannot auth onto unconfigured machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await screen.findByText('VxAdmin is Locked');
  screen.getByText('Insert System Administrator card to unlock.');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.'
  );
});

test('election manager cannot auth onto machine with different election hash', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await screen.findByText('VxAdmin is Locked');
  await screen.findByText(
    'Insert System Administrator or Election Manager card to unlock.'
  );
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'election_manager_wrong_election',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.'
  );
});

test('primary election flow', async () => {
  const { electionDefinition, legacyCvrData } =
    electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);

  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(legacyCvrData, electionDefinition)
  );
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetWriteInTalliesAdjudicated([]);

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  // Confirm "L&A" page prints separate test deck tally reports for non-partisan contests
  userEvent.click(screen.getByText('L&A'));
  userEvent.click(await screen.findByText('Print Full Test Deck Tally Report'));
  await expectPrint((printedElement) => {
    printedElement.getByText(
      'Test Deck Mammal Party Example Primary Election Tally Report'
    );
    printedElement.getByText(
      'Test Deck Fish Party Example Primary Election Tally Report'
    );
    printedElement.getByText(
      'Test Deck Example Primary Election Nonpartisan Contests Tally Report'
    );
  });

  // Check that nonpartisan races are separated in non party-specific reports
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Full Election Tally Report'));
  const pages = screen.getAllByTestId('election-full-tally-report');
  expect(pages).toHaveLength(3);
  within(pages[0]).getByText(
    'Unofficial Mammal Party Example Primary Election Tally Report'
  );
  within(pages[1]).getByText(
    'Unofficial Fish Party Example Primary Election Tally Report'
  );
  within(pages[2]).getByText(
    'Unofficial Example Primary Election Nonpartisan Contests Tally Report'
  );
  within(
    within(pages[2]).getByText('Total Ballots Cast').closest('tr')!
  ).getByText('3,000');

  // Check that nonpartisan races are broken out in party-specific reports
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Fish Party Tally Report'));
  const partyReportPages = screen.getAllByTestId('election-full-tally-report');
  expect(partyReportPages).toHaveLength(2);
  within(partyReportPages[0]).getByText(
    'Unofficial Fish Party Example Primary Election Tally Report'
  );
  within(partyReportPages[1]).getByText(
    'Unofficial Example Primary Election Nonpartisan Contests Tally Report'
  );
  within(
    within(partyReportPages[1]).getByText('Total Ballots Cast').closest('tr')!
  ).getByText('1,510');
});

test('usb formatting flows', async () => {
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  mockKiosk.formatUsbDrive.mockImplementation(async () => {
    await advanceTimersAndPromises(1);
  });

  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCurrentElectionMetadata();
  apiMock.expectGetFullElectionManualTally();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // navigate to modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('USB Formatting');
  userEvent.click(screen.getByRole('button', { name: 'Format USB' }));

  // Because the "No USB Drive Detected" and other modals are distinct in the
  // DOM, we need to continually refresh our reference to the modal
  async function findModal(text: string) {
    return waitFor(() => {
      const currentModal = screen.getByRole('alertdialog');
      within(currentModal).getByText(text);
      return currentModal;
    });
  }

  // initial prompt to insert USB drive
  let modal = await findModal('No USB Drive Detected');

  // Inserting a USB drive that already is in VotingWorks format, which should mount
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  modal = await findModal('Loading');

  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  // Format USB Drive
  await within(modal).findByText('Format USB Drive');
  within(modal).getByText(/already VotingWorks compatible/);
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  await within(modal).findByText('Confirm Format USB Drive');
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  await within(modal).findByText('Formatting USB Drive');
  await within(modal).findByText('USB Drive Formatted');
  screen.getByText('Ejected');

  // Removing USB resets modal
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  modal = await findModal('No USB Drive Detected');

  // Format another USB, this time in an incompatible format
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined, fsType: 'exfat' }),
  ]);
  modal = await findModal('Format USB Drive');
  within(modal).getByText(/not VotingWorks compatible/);
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  await within(modal).findByText('Confirm Format USB Drive');
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  await within(modal).findByText('Formatting USB Drive');
  await within(modal).findByText('USB Drive Formatted');
  screen.getByText('Ejected');

  // Removing USB resets modal
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  modal = await findModal('No USB Drive Detected');
  // Error handling
  mockKiosk.formatUsbDrive.mockRejectedValueOnce(new Error('unable to format'));
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  modal = await findModal('Format USB Drive');
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  await within(modal).findByText('Confirm Format USB Drive');
  userEvent.click(within(modal).getByRole('button', { name: 'Format USB' }));
  await within(modal).findByText('Failed to Format USB Drive');
  within(modal).getByText(/unable to format/);

  // Removing USB resets modal
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  modal = await findModal('No USB Drive Detected');
});
